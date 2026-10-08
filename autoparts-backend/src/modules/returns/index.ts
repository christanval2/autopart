import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { ReturnRequest }    from '../../entities/ReturnRequest';
import { Order }            from '../../entities/Order';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }         from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateReturnSchema = z.object({
  orderId:     z.string().uuid(),
  reason:      z.enum(['defective','wrong_item','not_as_described','changed_mind','damaged_shipping','other']),
  description: z.string().max(1000).trim().optional(),
  lines:       z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
});

const UpdateReturnSchema = z.object({
  status:         z.enum(['approved','rejected','received','refunded']),
  resolutionNotes:z.string().max(1000).trim().optional(),
  refundAmount:   z.number().positive().optional(),
  returnTracking: z.string().max(100).optional(),
});

const repo = () => AppDataSource.getRepository(ReturnRequest);
const orderRepo = () => AppDataSource.getRepository(Order);

export const ReturnsService = {
  async list(orgId?: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('r')
      .leftJoinAndSelect('r.order','o')
      .leftJoinAndSelect('r.requester','u');
    if (orgId) qb.andWhere('o.sellerOrg.id = :orgId', { orgId });
    qb.orderBy('r.createdAt','DESC');
    return paginate(qb, page, limit);
  },
  async create(requesterId: string, dto: z.infer<typeof CreateReturnSchema>) {
    const order = await orderRepo().findOne({ where: { id: dto.orderId, buyer: { id: requesterId } } });
    if (!order) throw ApiError.notFound('Commande');
    if (!['delivered'].includes(order.status)) throw ApiError.badRequest('Retour possible uniquement pour les commandes livrées');
    return repo().save(repo().create({
      order:     { id: dto.orderId }, requester: { id: requesterId },
      reason:    dto.reason, description: dto.description, lines: dto.lines, status: 'requested',
    }));
  },
  async update(id: string, dto: z.infer<typeof UpdateReturnSchema>) {
    const ret = await repo().findOne({ where: { id }, relations: ['order'] });
    if (!ret) throw ApiError.notFound('Demande de retour');
    Object.assign(ret, dto);
    const saved = await repo().save(ret);
    // Si remboursé → mettre à jour le statut de la commande
    if (dto.status === 'refunded') {
      await orderRepo().update(ret.order.id, { status: 'refunded' });
    }
    return saved;
  },
};

export const returnsRouter = Router();
returnsRouter.use(authenticate);
returnsRouter.get('/',    async (req,res,next) => {
  try {
    const isAdmin = req.user!.roles.some(r => ['super_admin','org_admin','logistics'].includes(r));
    res.json(ApiResponse.paginated(await ReturnsService.list(isAdmin ? req.user!.orgId ?? undefined : undefined, +req.query.page!||1)));
  } catch(e){next(e);}
});
returnsRouter.post('/',   validate(CreateReturnSchema), async (req,res,next) => {
  try { res.status(201).json(ApiResponse.created(await ReturnsService.create(req.user!.id, req.body))); } catch(e){next(e);}
});
returnsRouter.patch('/:id', validateParams('id'), authorize('super_admin','org_admin','logistics'), validate(UpdateReturnSchema), async (req,res,next) => {
  try { res.json(ApiResponse.success(await ReturnsService.update(req.params.id, req.body))); } catch(e){next(e);}
});
