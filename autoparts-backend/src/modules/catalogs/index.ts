import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { Catalog }          from '../../entities/Catalog';
import { CatalogProduct }   from '../../entities/CatalogProduct';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }         from '../../shared/utils/helpers';
import { cached, invalidate, CacheKeys } from '../../config/redis';
import { validate, validateParams, authenticate, authorize } from '../../middlewares';

// ─── Schémas Zod ─────────────────────────────────────────────────

export const CreateCatalogSchema = z.object({
  name:       z.string().min(2).max(150),
  visibility: z.enum(['public', 'private', 'b2b_only']).default('b2b_only'),
  markupPct:  z.number().min(0).max(500).default(0),
  validFrom:  z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
}).refine(d => !d.validFrom || !d.validUntil || d.validFrom < d.validUntil, {
  message: 'validFrom doit être avant validUntil',
  path: ['validFrom'],
});

export const AddCatalogProductSchema = z.object({
  variantId:   z.string().uuid(),
  customPrice: z.number().positive().optional(),
  minQty:      z.number().int().positive().default(1),
  maxQty:      z.number().int().positive().optional(),
});

export const BulkAddSchema = z.object({
  products: z.array(AddCatalogProductSchema).min(1).max(500),
});

export const CatalogQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  visibility: z.enum(['public', 'private', 'b2b_only']).optional(),
  active:     z.coerce.boolean().default(true),
});

// ─── Service ─────────────────────────────────────────────────────

const catalogRepo    = () => AppDataSource.getRepository(Catalog);
const catProductRepo = () => AppDataSource.getRepository(CatalogProduct);

export const CatalogsService = {

  async findAll(orgId: string, query: z.infer<typeof CatalogQuerySchema>) {
    const qb = catalogRepo()
      .createQueryBuilder('c')
      .where('c.org.id = :orgId', { orgId })
      .andWhere('c.isActive = :active', { active: query.active });

    if (query.visibility) qb.andWhere('c.visibility = :vis', { vis: query.visibility });
    return paginate(qb, query.page, query.limit);
  },

  async findPublic(query: { page: number; limit: number }) {
    // Catalogues publics ou b2b de toutes les orgs (marketplace)
    const qb = catalogRepo()
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.org', 'o')
      .where('c.isActive = true')
      .andWhere('c.visibility IN (:...vis)', { vis: ['public', 'b2b_only'] })
      .andWhere('(c.validUntil IS NULL OR c.validUntil >= NOW())')
      .andWhere('(c.validFrom IS NULL OR c.validFrom <= NOW())');

    return paginate(qb, query.page, query.limit);
  },

  async findById(id: string): Promise<Catalog> {
    return cached(CacheKeys.catalog(id), async () => {
      const c = await catalogRepo().findOne({
        where: { id, isActive: true },
        relations: ['org'],
      });
      if (!c) throw ApiError.notFound('Catalogue');
      return c;
    });
  },

  async create(orgId: string, dto: z.infer<typeof CreateCatalogSchema>): Promise<Catalog> {
    const catalog = catalogRepo().create({ ...dto, org: { id: orgId } });
    return catalogRepo().save(catalog);
  },

  async update(id: string, orgId: string, dto: Partial<z.infer<typeof CreateCatalogSchema>>): Promise<Catalog> {
    const catalog = await this.findById(id);
    if ((catalog.org as any)?.id !== orgId) throw ApiError.forbidden();

    Object.assign(catalog, dto);
    const saved = await catalogRepo().save(catalog);
    await invalidate(CacheKeys.catalog(id));
    return saved;
  },

  async addProduct(catalogId: string, orgId: string, dto: z.infer<typeof AddCatalogProductSchema>): Promise<CatalogProduct> {
    const catalog = await this.findById(catalogId);
    if ((catalog.org as any)?.id !== orgId) throw ApiError.forbidden();

    const exists = await catProductRepo().findOneBy({
      catalog: { id: catalogId },
      variant: { id: dto.variantId },
    });
    if (exists) {
      // Mise à jour si déjà présent
      Object.assign(exists, dto);
      return catProductRepo().save(exists);
    }

    const entry = catProductRepo().create({
      catalog: { id: catalogId },
      variant: { id: dto.variantId },
      customPrice:  dto.customPrice,
      minQty:       dto.minQty,
      maxQty:       dto.maxQty,
      isAvailable:  true,
    });
    await invalidate(CacheKeys.catalog(catalogId));
    return catProductRepo().save(entry);
  },

  async bulkAddProducts(catalogId: string, orgId: string, products: z.infer<typeof AddCatalogProductSchema>[]): Promise<{ added: number; updated: number }> {
    const catalog = await this.findById(catalogId);
    if ((catalog.org as any)?.id !== orgId) throw ApiError.forbidden();

    let added = 0, updated = 0;
    await AppDataSource.transaction(async manager => {
      for (const dto of products) {
        const exists = await manager.findOneBy(CatalogProduct, {
          catalog: { id: catalogId },
          variant: { id: dto.variantId },
        });
        if (exists) {
          Object.assign(exists, dto);
          await manager.save(CatalogProduct, exists);
          updated++;
        } else {
          await manager.save(CatalogProduct, manager.create(CatalogProduct, {
            catalog: { id: catalogId },
            variant: { id: dto.variantId },
            ...dto,
            isAvailable: true,
          }));
          added++;
        }
      }
    });
    await invalidate(CacheKeys.catalog(catalogId));
    return { added, updated };
  },

  async getProducts(catalogId: string, page: number, limit: number) {
    const qb = catProductRepo()
      .createQueryBuilder('cp')
      .innerJoinAndSelect('cp.variant', 'v')
      .innerJoinAndSelect('v.product', 'p')
      .leftJoinAndSelect('p.images', 'img', 'img.isPrimary = true')
      .where('cp.catalogId = :catalogId AND cp.isAvailable = true', { catalogId });

    return paginate(qb, page, limit);
  },

  async removeProduct(catalogId: string, variantId: string, orgId: string): Promise<void> {
    const catalog = await this.findById(catalogId);
    if ((catalog.org as any)?.id !== orgId) throw ApiError.forbidden();

    await catProductRepo().delete({ catalog: { id: catalogId }, variant: { id: variantId } });
    await invalidate(CacheKeys.catalog(catalogId));
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const Ctrl = {
  list:    async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.paginated(await CatalogsService.findAll(req.user!.orgId!, req.query as any))); } catch (e) { next(e); }
  },
  public:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.paginated(await CatalogsService.findPublic(req.query as any))); } catch (e) { next(e); }
  },
  getOne:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await CatalogsService.findById(req.params.id))); } catch (e) { next(e); }
  },
  create:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(ApiResponse.created(await CatalogsService.create(req.user!.orgId!, req.body))); } catch (e) { next(e); }
  },
  update:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await CatalogsService.update(req.params.id, req.user!.orgId!, req.body), 'Catalogue mis à jour')); } catch (e) { next(e); }
  },
  addProduct: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(ApiResponse.created(await CatalogsService.addProduct(req.params.id, req.user!.orgId!, req.body))); } catch (e) { next(e); }
  },
  bulkAdd: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await CatalogsService.bulkAddProducts(req.params.id, req.user!.orgId!, req.body.products))); } catch (e) { next(e); }
  },
  getProducts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20 } = req.query as any;
      res.json(ApiResponse.paginated(await CatalogsService.getProducts(req.params.id, +page, +limit)));
    } catch (e) { next(e); }
  },
  removeProduct: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await CatalogsService.removeProduct(req.params.id, req.params.variantId, req.user!.orgId!);
      res.json(ApiResponse.noContent());
    } catch (e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const catalogsRouter = Router();

catalogsRouter.get('/public', Ctrl.public);
catalogsRouter.get('/:id/products', Ctrl.getProducts);

catalogsRouter.use(authenticate);

catalogsRouter.get('/',    validate(CatalogQuerySchema, 'query'), Ctrl.list);
catalogsRouter.get('/:id', Ctrl.getOne);
catalogsRouter.post('/',   authorize('seller', 'org_admin', 'super_admin'), validate(CreateCatalogSchema as unknown as import('zod').AnyZodObject), Ctrl.create);
catalogsRouter.patch('/:id', authorize('seller', 'org_admin', 'super_admin'), Ctrl.update);
catalogsRouter.post('/:id/products', authorize('seller', 'org_admin', 'super_admin'), validate(AddCatalogProductSchema), Ctrl.addProduct);
catalogsRouter.post('/:id/products/bulk', authorize('seller', 'org_admin', 'super_admin'), validate(BulkAddSchema), Ctrl.bulkAdd);
catalogsRouter.delete('/:id/products/:variantId', authorize('seller', 'org_admin', 'super_admin'), Ctrl.removeProduct);

// R3 — désactivation soft (jamais de suppression physique : produits liés)
catalogsRouter.delete('/:id',
  validateParams('id'),
  authorize('seller', 'org_admin', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catalog = await (AppDataSource.getRepository(Catalog));
      const c = await catalog.findOne({ where: { id: req.params.id }, relations: ['org'] });
      if (!c) throw ApiError.notFound('Catalogue');
      if ((c.org as any)?.id !== req.user!.orgId && !req.user!.roles.includes('super_admin')) {
        throw ApiError.forbidden();
      }
      c.isActive = false;
      await catalog.save(c);
      invalidate(CacheKeys.catalog(c.id));
      res.json(ApiResponse.noContent());
    } catch (e) { next(e); }
  },
);
