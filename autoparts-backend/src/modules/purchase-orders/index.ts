import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { PurchaseOrder }    from '../../entities/PurchaseOrder';
import { StockLevel }       from '../../entities/StockLevel';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate, generateRef } from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';
import { recordStockMovement } from '../../shared/utils/stock-log';

const CreatePOSchema = z.object({
  supplierName:  z.string().min(2).max(255).trim(),
  supplierEmail: z.string().email().optional(),
  warehouseId:   z.string().uuid(),
  expectedAt:    z.coerce.date().optional(),
  notes:         z.string().max(1000).optional(),
  currency:      z.string().length(3).default('XAF'),
  lines: z.array(z.object({
    variantId:      z.string().uuid(),
    sku:            z.string(),
    quantityOrdered:z.number().int().positive(),
    unitCost:       z.number().positive(),
  })).min(1),
});

const ReceiveSchema = z.object({
  lines: z.array(z.object({
    variantId:        z.string().uuid(),
    quantityReceived: z.number().int().min(0),
  })).min(1),
});

const repo  = () => AppDataSource.getRepository(PurchaseOrder);
const slRepo= () => AppDataSource.getRepository(StockLevel);

export const PurchaseOrdersService = {
  async list(orgId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('po')
      .leftJoinAndSelect('po.warehouse','wh')
      .where('po.buyerOrg.id = :orgId', { orgId })
      .orderBy('po.createdAt','DESC');
    return paginate(qb, page, limit);
  },

  async create(orgId: string, userId: string, dto: z.infer<typeof CreatePOSchema>) {
    const total = dto.lines.reduce((s,l) => s + l.unitCost * l.quantityOrdered, 0);
    const lines = dto.lines.map(l => ({ ...l, quantityReceived: 0 }));
    return repo().save(repo().create({
      poNumber:      generateRef('PO'),
      buyerOrg:      { id: orgId },
      createdBy:     { id: userId },
      supplierName:  dto.supplierName,
      supplierEmail: dto.supplierEmail,
      warehouse:     { id: dto.warehouseId },
      expectedAt:    dto.expectedAt,
      notes:         dto.notes,
      lines,
      totalAmount:   total,
      currency:      dto.currency,
      status:        'draft',
    }));
  },

  async send(id: string) {
    const po = await repo().findOneByOrFail({ id });
    if (po.status !== 'draft') throw ApiError.badRequest('Bon de commande non en brouillon');
    po.status = 'sent';
    return repo().save(po);
  },

  async receive(id: string, dto: z.infer<typeof ReceiveSchema>, userId?: string) {
    const po = await repo().findOne({ where: { id }, relations: ['warehouse'] });
    if (!po) throw ApiError.notFound('Bon de commande');
    if (!['sent','confirmed','partial'].includes(po.status))
      throw ApiError.badRequest('Bon de commande non envoyé');

    let allReceived = true;
    for (const recv of dto.lines) {
      const line = (po.lines as any[]).find(l => l.variantId === recv.variantId);
      if (!line) continue;
      line.quantityReceived = (line.quantityReceived || 0) + recv.quantityReceived;
      if (line.quantityReceived < line.quantityOrdered) allReceived = false;

      // Incrémenter le stock en entrepôt (en transaction, avec audit F3)
      await AppDataSource.transaction(async manager => {
        const warehouseId = (po.warehouse as any).id;
        const existing = await manager.findOne(StockLevel, {
          where: { variant: { id: recv.variantId }, warehouse: { id: warehouseId } },
        });
        const before = existing?.qtyOnHand ?? 0;
        if (existing) {
          await manager.createQueryBuilder()
            .update(StockLevel).set({ qtyOnHand: () => 'qty_on_hand + :qty' })
            .setParameter('qty', Math.trunc(recv.quantityReceived))
            .where('id = :id', { id: existing.id }).execute();
        } else {
          await manager.save(StockLevel, manager.create(StockLevel, {
            variant:   { id: recv.variantId },
            warehouse: { id: warehouseId },
            qtyOnHand: recv.quantityReceived, qtyReserved: 0,
          }));
        }
        await recordStockMovement(manager, {
          variantId:   recv.variantId,
          warehouseId,
          reason:      'purchase',
          qtyDelta:    Math.trunc(recv.quantityReceived),
          qtyBefore:   before,
          qtyAfter:    before + Math.trunc(recv.quantityReceived),
          userId:      userId ?? null,
          note:        `Réception PO ${po.poNumber ?? po.id}`,
        });
      });
    }

    po.lines  = po.lines as any;
    po.status = allReceived ? 'received' : 'partial';
    return repo().save(po);
  },
};

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(authenticate, authorize('super_admin','org_admin','logistics'));
purchaseOrdersRouter.get('/',            async (req,res,next) => { try { res.json(ApiResponse.paginated(await PurchaseOrdersService.list(req.user!.orgId!, +req.query.page!||1))); } catch(e){next(e);} });
purchaseOrdersRouter.post('/',           validate(CreatePOSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await PurchaseOrdersService.create(req.user!.orgId!, req.user!.id, req.body))); } catch(e){next(e);} });
purchaseOrdersRouter.post('/:id/send',   validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await PurchaseOrdersService.send(req.params.id))); } catch(e){next(e);} });
purchaseOrdersRouter.post('/:id/receive',validateParams('id'), validate(ReceiveSchema), async (req,res,next) => { try { res.json(ApiResponse.success(await PurchaseOrdersService.receive(req.params.id, req.body))); } catch(e){next(e);} });
