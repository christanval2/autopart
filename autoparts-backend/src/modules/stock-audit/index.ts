import { Router, Request, Response, NextFunction } from 'express';
import { z }              from 'zod';
import { AppDataSource }  from '../../config/database';
import { StockAudit }     from '../../entities/StockAudit';
import { StockLevel }     from '../../entities/StockLevel';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }       from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateAuditSchema = z.object({
  warehouseId:  z.string().uuid(),
  plannedDate:  z.coerce.date(),
  notes:        z.string().max(500).optional(),
});

const SubmitResultsSchema = z.object({
  results: z.array(z.object({
    variantId: z.string().uuid(),
    sku:       z.string(),
    expected:  z.number().int().min(0),
    counted:   z.number().int().min(0),
  })).min(1),
});

const repo  = () => AppDataSource.getRepository(StockAudit);
const slRepo= () => AppDataSource.getRepository(StockLevel);

export const StockAuditService = {
  async list(warehouseId?: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('a')
      .leftJoinAndSelect('a.warehouse','wh').leftJoinAndSelect('a.conductedBy','u');
    if (warehouseId) qb.where('a.warehouse.id = :wh', { wh: warehouseId });
    qb.orderBy('a.createdAt','DESC');
    return paginate(qb, page, limit);
  },

  async create(userId: string, dto: z.infer<typeof CreateAuditSchema>) {
    const existing = await repo().findOne({
      where: { warehouse: { id: dto.warehouseId }, status: 'in_progress' },
    });
    if (existing) throw ApiError.conflict('Un inventaire est déjà en cours pour cet entrepôt');
    return repo().save(repo().create({
      warehouse: { id: dto.warehouseId }, conductedBy: { id: userId },
      plannedDate: dto.plannedDate, notes: dto.notes, status: 'planned',
    }));
  },

  async start(id: string) {
    const audit = await repo().findOneByOrFail({ id });
    if (audit.status !== 'planned') throw ApiError.badRequest('Inventaire non planifié');
    audit.status = 'in_progress';
    return repo().save(audit);
  },

  async submitResults(id: string, dto: z.infer<typeof SubmitResultsSchema>) {
    const audit = await repo().findOne({ where: { id }, relations: ['warehouse'] });
    if (!audit) throw ApiError.notFound('Inventaire');
    if (audit.status !== 'in_progress') throw ApiError.badRequest('Inventaire non démarré');

    const results = dto.results.map(r => ({ ...r, diff: r.counted - r.expected }));

    // Appliquer les ajustements de stock pour les écarts
    for (const r of results) {
      if (r.diff !== 0) {
        await slRepo().createQueryBuilder()
          .update(StockLevel)
          .set({ qtyOnHand: () => 'qty_on_hand + :diff' })
          .setParameter('diff', Math.trunc(r.diff))
          .where('variant_id = :vid AND warehouse_id = :wh', { vid: r.variantId, wh: (audit.warehouse as any).id })
          .execute();
      }
    }

    audit.results       = results;
    audit.status        = 'completed';
    audit.completedDate = new Date();
    return repo().save(audit);
  },
};

export const stockAuditRouter = Router();
stockAuditRouter.use(authenticate, authorize('super_admin','org_admin','logistics'));
stockAuditRouter.get('/',           async (req,res,next) => { try { res.json(ApiResponse.paginated(await StockAuditService.list(req.query.warehouseId as string|undefined, +req.query.page!||1))); } catch(e){next(e);} });
stockAuditRouter.post('/',          validate(CreateAuditSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await StockAuditService.create(req.user!.id, req.body))); } catch(e){next(e);} });
stockAuditRouter.post('/:id/start', validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await StockAuditService.start(req.params.id))); } catch(e){next(e);} });
stockAuditRouter.post('/:id/submit',validateParams('id'), validate(SubmitResultsSchema), async (req,res,next) => { try { res.json(ApiResponse.success(await StockAuditService.submitResults(req.params.id, req.body))); } catch(e){next(e);} });
