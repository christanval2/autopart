import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { Dispute }       from '../../entities/Dispute';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }      from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateDisputeSchema = z.object({
  orderId:     z.string().uuid(),
  type:        z.enum(['not_received','wrong_item','quality','payment','other']),
  description: z.string().min(20).max(2000).trim(),
  evidenceUrls:z.array(z.string().url()).max(5).optional(),
});

const UpdateDisputeSchema = z.object({
  status:          z.enum(['under_review','resolved_buyer','resolved_seller','closed']),
  resolutionNotes: z.string().max(2000).trim().optional(),
  assignedToId:    z.string().uuid().optional(),
});

const repo = () => AppDataSource.getRepository(Dispute);

export const DisputesService = {
  /**
   * Liste des litiges. super_admin : tous. Les autres rôles : uniquement
   * les litiges qu'ils ont ouverts ou ceux concernant leurs commandes
   * (acheteur) / leur organisation vendeuse (org_admin, seller).
   */
  async list(
    page = 1,
    limit = 20,
    ctx?: { userId: string; orgId?: string | null; isSuper: boolean },
  ) {
    const qb = repo().createQueryBuilder('d')
      .leftJoinAndSelect('d.claimant','u').leftJoinAndSelect('d.order','o').leftJoinAndSelect('d.assignedTo','a')
      .orderBy('d.createdAt','DESC');
    if (ctx && !ctx.isSuper) {
      qb.andWhere('(d.claimant_id = :uid OR o.seller_org_id = :orgId)', {
        uid: ctx.userId, orgId: ctx.orgId ?? null,
      });
    }
    return paginate(qb, page, limit);
  },
  async create(claimantId: string, dto: z.infer<typeof CreateDisputeSchema>) {
    const existing = await repo().findOne({ where: { order: { id: dto.orderId }, claimant: { id: claimantId } } });
    if (existing && ['open','under_review'].includes(existing.status))
      throw ApiError.conflict('Un litige est déjà ouvert pour cette commande');
    return repo().save(repo().create({
      order: { id: dto.orderId }, claimant: { id: claimantId },
      type: dto.type, description: dto.description, evidenceUrls: dto.evidenceUrls, status: 'open',
    }));
  },
  async update(id: string, dto: z.infer<typeof UpdateDisputeSchema>) {
    const dispute = await repo().findOneByOrFail({ id });
    if (dispute.status === 'closed') throw ApiError.badRequest('Litige déjà fermé');
    dispute.status = dto.status;
    if (dto.resolutionNotes) dispute.resolutionNotes = dto.resolutionNotes;
    if (dto.assignedToId) dispute.assignedTo = { id: dto.assignedToId } as any;
    return repo().save(dispute);
  },
};

export const disputesRouter = Router();
disputesRouter.use(authenticate);

// Scopé : super_admin voit tout ; les autres ne voient que les litiges
// qu'ils ont ouverts ou ceux concernant leur organisation vendeuse
disputesRouter.get('/',    authorize('super_admin','org_admin','seller','buyer'), async (req,res,next) => {
  try {
    const isSuper = req.user!.roles.includes('super_admin');
    res.json(ApiResponse.paginated(await DisputesService.list(
      +req.query.page!||1,
      20,
      isSuper ? undefined : { userId: req.user!.id, orgId: req.user!.orgId ?? undefined, isSuper },
    )));
  } catch(e){next(e);}
});
disputesRouter.post('/',   validate(CreateDisputeSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await DisputesService.create(req.user!.id, req.body))); } catch(e){next(e);} });
disputesRouter.patch('/:id', validateParams('id'), authorize('super_admin'), validate(UpdateDisputeSchema), async (req,res,next) => { try { res.json(ApiResponse.success(await DisputesService.update(req.params.id, req.body))); } catch(e){next(e);} });
