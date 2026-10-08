import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { PickList }      from '../../entities/PickList';
import { Order }         from '../../entities/Order';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }      from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreatePickListSchema = z.object({
  orderId:     z.string().uuid(),
  warehouseId: z.string().uuid(),
});
const UpdatePickSchema = z.object({
  status:  z.enum(['in_progress','completed','cancelled']),
  items:   z.array(z.object({
    variantId: z.string().uuid(),
    sku:       z.string(),
    qty:       z.number().int().min(0),
    location:  z.string().optional(),
    pickedAt:  z.string().optional(),
  })).optional(),
});

const repo  = () => AppDataSource.getRepository(PickList);

export const PickingService = {
  async list(warehouseId?: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('pl')
      .leftJoinAndSelect('pl.order','o').leftJoinAndSelect('pl.warehouse','wh')
      .leftJoinAndSelect('pl.picker','u');
    if (warehouseId) qb.where('pl.warehouse.id = :wh', { wh: warehouseId });
    qb.orderBy('pl.createdAt','DESC');
    return paginate(qb, page, limit);
  },

  async create(dto: z.infer<typeof CreatePickListSchema>) {
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: dto.orderId }, relations: ['lines','lines.variant'],
    });
    if (!order) throw ApiError.notFound('Commande');
    if (!['confirmed','processing'].includes(order.status))
      throw ApiError.badRequest('Commande non éligible au picking');

    const items = order.lines.map(l => ({
      variantId: l.variant.id,
      sku:       l.variant.variantSku,
      qty:       l.quantity,
    }));

    return repo().save(repo().create({
      order:     { id: dto.orderId },
      warehouse: { id: dto.warehouseId },
      items, status: 'pending',
    }));
  },

  async assign(id: string, pickerId: string) {
    const pl = await repo().findOneByOrFail({ id });
    pl.picker     = { id: pickerId } as any;
    pl.status     = 'in_progress';
    pl.startedAt  = new Date();
    return repo().save(pl);
  },

  async update(id: string, dto: z.infer<typeof UpdatePickSchema>) {
    const pl = await repo().findOneByOrFail({ id });
    if (pl.status === 'completed') throw ApiError.badRequest('Picking déjà terminé');
    if (dto.items) pl.items = dto.items as any;
    pl.status = dto.status;
    if (dto.status === 'completed') pl.completedAt = new Date();
    return repo().save(pl);
  },

  /**
   * F3.3 — scan d'article (code-barres variantSku / référence OEM).
   * Confirme les lignes une à une : `picked` accumulé, pickedAt horodaté.
   * La picklist passe `in_progress` au premier scan et reste `in_progress`
   * tant qu'il reste des articles — le passage `completed` reste explicite
   * (PATCH /:id) pour permettre la bascule en expédition partielle si manque.
   */
  async scan(id: string, code: string, qty: number) {
    const pl = await repo().findOneByOrFail({ id });
    if (pl.status === 'completed' || pl.status === 'cancelled') {
      throw ApiError.badRequest('Picklist clôturée');
    }

    const wanted = code.trim().toUpperCase();
    const items = pl.items as Array<{ variantId: string; sku: string; qty: number; picked?: number; pickedAt?: string }>;
    const item = items.find(i => i.sku.toUpperCase() === wanted || i.variantId === code.trim());
    if (!item) throw ApiError.notFound(`Article scanné introuvable dans la picklist (${code})`);
    if ((item.picked ?? 0) + qty > item.qty) {
      throw ApiError.badRequest(`Quantité dépassée : ${item.qty - (item.picked ?? 0)} restant(s) à prélever`);
    }

    item.picked   = (item.picked ?? 0) + qty;
    item.pickedAt = new Date().toISOString();

    const allPicked = items.every(i => (i.picked ?? 0) >= i.qty);
    pl.items   = items as any;
    pl.status  = 'in_progress';
    if (allPicked) {
      // Tout est prélevé : complétion automatique
      pl.status      = 'completed';
      pl.completedAt = new Date();
    }
    return repo().save(pl);
  },
};

export const pickingRouter = Router();
pickingRouter.use(authenticate, authorize('super_admin','org_admin','logistics'));
pickingRouter.get('/',      async (req,res,next) => { try { res.json(ApiResponse.paginated(await PickingService.list(req.query.warehouseId as string|undefined, +req.query.page!||1))); } catch(e){next(e);} });
pickingRouter.post('/',     validate(CreatePickListSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await PickingService.create(req.body))); } catch(e){next(e);} });
pickingRouter.post('/:id/assign', validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await PickingService.assign(req.params.id, req.user!.id))); } catch(e){next(e);} });
pickingRouter.patch('/:id', validateParams('id'), validate(UpdatePickSchema), async (req,res,next) => { try { res.json(ApiResponse.success(await PickingService.update(req.params.id, req.body))); } catch(e){next(e);} });

// F3.3 — scan d'un article (mobile préparation)
const ScanSchema = z.object({
  code: z.string().min(3).max(120),   // variantSku ou UUID de variante
  qty:  z.number().int().positive().default(1),
});
pickingRouter.post('/:id/scan', validateParams('id'), validate(ScanSchema), async (req,res,next) => {
  try { res.json(ApiResponse.success(await PickingService.scan(req.params.id, req.body.code, req.body.qty))); } catch(e){next(e);}
});
