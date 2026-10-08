import { Router, Request, Response, NextFunction } from 'express';
import { z }               from 'zod';
import { AppDataSource }   from '../../config/database';
import { Commission }      from '../../entities/Commission';
import { Order }           from '../../entities/Order';
import { ApiResponse }     from '../../shared/utils/response';
import { paginate }        from '../../shared/utils/helpers';
import { authenticate, authorize, validateParams } from '../../middlewares';

const DEFAULT_RATE = 0.05; // 5% de commission plateforme

const repo = () => AppDataSource.getRepository(Commission);

export const CommissionsService = {
  async list(orgId?: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('c')
      .leftJoinAndSelect('c.order','o').leftJoinAndSelect('c.sellerOrg','org');
    if (orgId) qb.where('c.sellerOrg.id = :orgId', { orgId });
    qb.orderBy('c.createdAt','DESC');
    return paginate(qb, page, limit);
  },

  /** Calculer et créer la commission d'une commande livrée */
  async createForOrder(orderId: string) {
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: orderId, status: 'delivered' }, relations: ['sellerOrg'],
    });
    if (!order) return;
    const existing = await repo().findOneBy({ order: { id: orderId } });
    if (existing) return existing; // déjà calculée

    const commissionAmount = order.totalAmount * DEFAULT_RATE;
    return repo().save(repo().create({
      order: { id: orderId }, sellerOrg: { id: (order.sellerOrg as any).id },
      ratePct: DEFAULT_RATE * 100, baseAmount: order.totalAmount,
      commissionAmount, currency: order.currency, status: 'pending',
    }));
  },

  async validate(id: string) {
    const c = await repo().findOneByOrFail({ id });
    c.status = 'validated';
    return repo().save(c);
  },

  async markPaid(id: string) {
    const c = await repo().findOneByOrFail({ id });
    c.status = 'paid'; c.paidAt = new Date();
    return repo().save(c);
  },

  async summary(orgId?: string) {
    const qb = repo().createQueryBuilder('c');
    if (orgId) qb.where('c.sellerOrg.id = :orgId', { orgId });
    return qb
      .select('c.status', 'status')
      .addSelect('SUM(c.commissionAmount)', 'total')
      .addSelect('COUNT(c.id)', 'count')
      .groupBy('c.status').getRawMany();
  },
};

export const commissionsRouter = Router();
commissionsRouter.use(authenticate);

// Lecture : le vendeur voit SES commissions (scopées à son org côté
// serveur), le super_admin voit tout (ou filtre par ?orgId=).
commissionsRouter.use('/summary', authorize('seller','org_admin','super_admin'));
commissionsRouter.get('/summary', async (req,res,next) => {
  try {
    const isSuper = req.user!.roles.includes('super_admin');
    const orgId = isSuper ? (req.query.orgId as string | undefined) : req.user!.orgId ?? undefined;
    res.json(ApiResponse.success(await CommissionsService.summary(orgId)));
  } catch(e){next(e);}
});
commissionsRouter.get('/', authorize('seller','org_admin','super_admin'), async (req,res,next) => {
  try {
    const isSuper = req.user!.roles.includes('super_admin');
    const orgId = isSuper ? (req.query.orgId as string | undefined) : req.user!.orgId ?? undefined;
    res.json(ApiResponse.paginated(await CommissionsService.list(orgId, +req.query.page!||1)));
  } catch(e){next(e);}
});

// Validation / paiement d'une commission : plateforme uniquement
commissionsRouter.post('/:id/validate', authorize('super_admin'), validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await CommissionsService.validate(req.params.id))); } catch(e){next(e);} });
commissionsRouter.post('/:id/pay',      authorize('super_admin'), validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await CommissionsService.markPaid(req.params.id))); } catch(e){next(e);} });
