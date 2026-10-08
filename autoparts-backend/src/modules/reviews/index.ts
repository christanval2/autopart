import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { Review }           from '../../entities/Review';
import { Order }            from '../../entities/Order';
import { Product }          from '../../entities/Product';
import { StockLevel }       from '../../entities/StockLevel';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }         from '../../shared/utils/helpers';
import { validate, validateParams, authenticate, authorize } from '../../middlewares';

const CreateReviewSchema = z.object({
  productId: z.string().uuid(),
  orderId:   z.string().uuid().optional(),
  rating:    z.number().int().min(1).max(5),
  comment:   z.string().max(2000).optional(),
});

const ReviewQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().min(1).max(50).default(20),
  productId: z.string().uuid().optional(),
  rating:    z.coerce.number().int().min(1).max(5).optional(),
  verified:  z.coerce.boolean().optional(),
  // Modération : 'all' pour voir y compris rejetés (admin)
  status:    z.enum(['visible', 'pending', 'rejected', 'all']).default('visible'),
});

const SellerReplySchema = z.object({
  reply: z.string().min(2).max(2000).trim(),
});

const ModerateSchema = z.object({
  status: z.enum(['approved', 'pending', 'rejected']),
  reason: z.string().max(300).trim().optional(),
});

const reviewRepo  = () => AppDataSource.getRepository(Review);
const orderRepo   = () => AppDataSource.getRepository(Order);
const productRepo = () => AppDataSource.getRepository(Product);

export const ReviewsService = {
  async list(query: z.infer<typeof ReviewQuerySchema>) {
    const qb = reviewRepo()
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reviewer', 'u')
      .leftJoinAndSelect('r.product', 'p')
      .select(['r','u.id','u.firstName','u.lastName','p.id','p.name']);
    if (query.productId) qb.andWhere('r.product_id = :pid', { pid: query.productId });
    if (query.rating)    qb.andWhere('r.rating = :rat',    { rat: query.rating });
    if (query.verified !== undefined) qb.andWhere('r.isVerifiedPurchase = :v', { v: query.verified });
    if (query.status === 'visible')      qb.andWhere("r.status != 'rejected'");
    else if (query.status !== 'all')     qb.andWhere('r.status = :st', { st: query.status });
    qb.orderBy('r.createdAt', 'DESC');
    return paginate(qb, query.page, query.limit);
  },

  async create(reviewerId: string, dto: z.infer<typeof CreateReviewSchema>) {
    // Vérifier que le produit existe
    const product = await productRepo().findOneBy({ id: dto.productId, isActive: true });
    if (!product) throw ApiError.notFound('Produit');

    // Vérifier si l'avis existe déjà
    const existing = await reviewRepo().findOneBy({
      reviewer: { id: reviewerId },
      product:  { id: dto.productId },
    });
    if (existing) throw ApiError.conflict('Vous avez déjà laissé un avis pour ce produit');

    // Badge achat vérifié : commande livrée de l'acheteur contenant le produit.
    // E6 : si orderId absent, détection automatique sur les commandes livrées.
    let isVerifiedPurchase = false;
    let matchedOrderId: string | undefined;
    const qb = orderRepo()
      .createQueryBuilder('o')
      .innerJoin('o.lines', 'l')
      .innerJoin('l.variant', 'v')
      .where('o.buyer.id = :uid', { uid: reviewerId })
      .andWhere('o.status = :delivered', { delivered: 'delivered' })
      .andWhere('v.product.id = :pid', { pid: dto.productId });
    if (dto.orderId) qb.andWhere('o.id = :oid', { oid: dto.orderId });
    const deliveredOrder = await qb.getOne();
    if (deliveredOrder) {
      isVerifiedPurchase = true;
      matchedOrderId = deliveredOrder.id;
    }

    const review = reviewRepo().create({
      reviewer:           { id: reviewerId },
      product:            { id: dto.productId },
      order:              matchedOrderId ? { id: matchedOrderId } : undefined,
      rating:             dto.rating,
      comment:            dto.comment,
      isVerifiedPurchase,
    });
    return reviewRepo().save(review);
  },

  async getProductRating(productId: string) {
    const result = await reviewRepo()
      .createQueryBuilder('r')
      // Colonne brute (snake_case) : la propriété implicite productId de la
      // relation n'est pas traduite dans ce contexte → r.productid inexistant.
      .where('r.product_id = :pid', { pid: productId })
      .andWhere("r.status != 'rejected'")
      .select('AVG(r.rating)', 'average')
      .addSelect('COUNT(r.id)', 'count')
      .getRawOne<{ average: string; count: string }>();
    return {
      average: parseFloat(result?.average ?? '0'),
      count:   parseInt(result?.count ?? '0', 10),
    };
  },

  /**
   * E6 — Réponse publique du vendeur. Autorisé pour l'organisation qui
   * détient le stock du produit (produit → variantes → stock → entrepôt → org).
   */
  async sellerReply(reviewId: string, reply: string, ctx: { orgId?: string | null; isAdmin: boolean }) {
    const review = await reviewRepo().findOne({ where: { id: reviewId } });
    if (!review) throw ApiError.notFound('Avis');

    if (!ctx.isAdmin) {
      if (!ctx.orgId) throw ApiError.forbidden();
      const owns = await AppDataSource.getRepository(StockLevel)
        .createQueryBuilder('sl')
        .innerJoin('sl.warehouse', 'wh')
        .innerJoin('sl.variant', 'v')
        .where('wh.orgId = :orgId', { orgId: ctx.orgId })
        .andWhere('v.product.id = :pid', { pid: (review.product as any).id })
        .getExists();
      if (!owns) throw ApiError.forbidden('Seul le vendeur du produit peut répondre');
    }

    review.sellerReply = reply;
    review.sellerRepliedAt = new Date();
    return reviewRepo().save(review);
  },

  /** E6 — Modération admin : rejeter (masque) ou rétablir un avis. */
  async moderate(reviewId: string, status: 'approved'|'pending'|'rejected', reason?: string) {
    const review = await reviewRepo().findOneBy({ id: reviewId });
    if (!review) throw ApiError.notFound('Avis');
    review.status = status;
    review.rejectionReason = status === 'rejected' ? reason : undefined;
    return reviewRepo().save(review);
  },

  async delete(id: string, userId: string, isAdmin: boolean) {
    const review = await reviewRepo().findOne({
      where: { id },
      relations: ['reviewer'],
    });
    if (!review) throw ApiError.notFound('Avis');
    if (!isAdmin && (review.reviewer as any).id !== userId) throw ApiError.forbidden();
    await reviewRepo().remove(review);
  },
};

const Ctrl = {
  list:   async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.paginated(await ReviewsService.list(req.query as any))); } catch(e){next(e);} },
  create: async (req: Request, res: Response, next: NextFunction) => { try { res.status(201).json(ApiResponse.created(await ReviewsService.create(req.user!.id, req.body))); } catch(e){next(e);} },
  rating: async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await ReviewsService.getProductRating(req.params.productId))); } catch(e){next(e);} },
  reply:  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const review = await ReviewsService.sellerReply(req.params.id, req.body.reply, {
        orgId:   req.user!.orgId,
        isAdmin: req.user!.roles.includes('super_admin'),
      });
      res.json(ApiResponse.success(review, 'Réponse publiée'));
    } catch(e){next(e);}
  },
  moderate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const review = await ReviewsService.moderate(req.params.id, req.body.status, req.body.reason);
      res.json(ApiResponse.success(review, 'Avis modéré'));
    } catch(e){next(e);}
  },
  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.roles.includes('super_admin');
      await ReviewsService.delete(req.params.id, req.user!.id, isAdmin);
      res.json(ApiResponse.noContent());
    } catch(e){next(e);}
  },
};

export const reviewsRouter = Router();
reviewsRouter.get('/',                       validate(ReviewQuerySchema, 'query'), Ctrl.list);
reviewsRouter.get('/product/:productId/rating', Ctrl.rating);
reviewsRouter.use(authenticate);
reviewsRouter.post('/',    validate(CreateReviewSchema), Ctrl.create);
// E6 — réponse vendeur + modération admin
reviewsRouter.post('/:id/reply',
  authorize('seller', 'org_admin', 'super_admin'),
  validate(SellerReplySchema),
  Ctrl.reply,
);
reviewsRouter.post('/:id/moderate',
  authorize('super_admin'),
  validate(ModerateSchema),
  Ctrl.moderate,
);
reviewsRouter.delete('/:id', Ctrl.delete);
