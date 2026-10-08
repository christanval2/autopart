// ═══════════════════════════════════════════════════════════════
//  STOCK MODULE
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                 from 'zod';
import { AppDataSource }     from '../../config/database';
import { StockLevel }        from '../../entities/StockLevel';
import { Warehouse }         from '../../entities/Warehouse';
import { ProductVariant }    from '../../entities/ProductVariant';
import { invalidate, CacheKeys, redis } from '../../config/redis';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }          from '../../shared/utils/helpers';
import { validate, authenticate, authorize } from '../../middlewares';
import { recordStockMovement } from '../../shared/utils/stock-log';
import { StockMovement } from '../../entities/StockMovement';
import { StockForecast } from '../../entities/StockForecast';
import type { EntityManager } from 'typeorm';

// ─── Schémas Zod ─────────────────────────────────────────────────

export const SetStockSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId:   z.string().uuid(),
  qtyOnHand:   z.number().int().min(0),
  reorderPoint:z.number().int().min(0).optional(),
});

export const AdjustStockSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId:   z.string().uuid(),
  delta:       z.number().int(),               // +N ou -N
  reason:      z.enum(['purchase', 'sale', 'return', 'damage', 'correction', 'transfer']),
  note:        z.string().max(500).optional(),
});

export const TransferStockSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId:   z.string().uuid(),
  variantId:       z.string().uuid(),
  quantity:        z.number().int().positive(),
  note:            z.string().max(500).optional(),
});

export const StockQuerySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(50),
  warehouseId: z.string().uuid().optional(),
  variantId:   z.string().uuid().optional(),
  lowStock:    z.coerce.boolean().optional(),  // qty_available <= reorder_point
  outOfStock:  z.coerce.boolean().optional(),
});

export const CreateWarehouseSchema = z.object({
  name:        z.string().min(2).max(150),
  countryCode: z.string().length(2),
  city:        z.string().min(2).max(100),
  address:     z.string().max(500).optional(),
});

export const MovementQuerySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().min(1).max(200).default(50),
  variantId:   z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  orderId:     z.string().uuid().optional(),
  reason:      z.enum(['purchase','sale','return','damage','correction','transfer_in','transfer_out','reservation','release']).optional(),
  startDate:   z.coerce.date().optional(),
  endDate:     z.coerce.date().optional(),
});

// ─── Service ─────────────────────────────────────────────────────

const stockRepo     = () => AppDataSource.getRepository(StockLevel);
const warehouseRepo = () => AppDataSource.getRepository(Warehouse);

export const StockService = {

  async getStockLevels(orgId: string | undefined, query: z.infer<typeof StockQuerySchema>) {
    const qb = stockRepo()
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.variant', 'v')
      .leftJoinAndSelect('v.product', 'p');

    // R-vision — vue globale pour super_admin (sans org), org-scopée sinon.
    // Un SEUL join sur la relation warehouse : deux alias distincts sur la
    // même relation faisaient planter getManyAndCount (databaseName).
    if (orgId) {
      qb.innerJoinAndSelect('sl.warehouse', 'w', 'w.orgId = :orgId AND w.isActive = true', { orgId });
    } else {
      qb.leftJoinAndSelect('sl.warehouse', 'w');
    }

    if (query.warehouseId) qb.andWhere('sl.warehouseId = :wid', { wid: query.warehouseId });
    if (query.variantId)   qb.andWhere('sl.variantId = :vid',   { vid: query.variantId });
    if (query.lowStock)    qb.andWhere('sl.qty_on_hand - sl.qty_reserved <= v.reorderPoint');
    if (query.outOfStock)  qb.andWhere('sl.qty_on_hand - sl.qty_reserved = 0');

    // Pagination offset/limit manuelle : l'ORDER BY est une expression
    // (qty_on_hand - qty_reserved), incompatible avec skip/take de TypeORM
    // qui réécrit l'ORDER BY en le combinant aux colonnes du SELECT.
    // (jointures to-one uniquement : aucune duplication de lignes)
    const page  = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    qb.orderBy('sl.qty_on_hand - sl.qty_reserved', 'ASC');
    const [data, total] = await Promise.all([
      qb.offset((page - 1) * limit).limit(limit).getMany(),
      qb.getCount(),
    ]);
    return { data, total, page, limit };
  },

  async setStock(dto: z.infer<typeof SetStockSchema>, orgId: string): Promise<StockLevel> {
    // Vérifier que l'entrepôt appartient à l'org
    const warehouse = await warehouseRepo().findOneBy({
      id: dto.warehouseId, org: { id: orgId }, isActive: true,
    });
    if (!warehouse) throw ApiError.notFound('Entrepôt');

    const variant = await AppDataSource.getRepository(ProductVariant)
      .findOneBy({ id: dto.variantId, isActive: true });
    if (!variant) throw ApiError.notFound('Variante produit');

    let stock = await stockRepo().findOneBy({
      warehouse: { id: dto.warehouseId },
      variant:   { id: dto.variantId },
    });

    if (stock) {
      stock.qtyOnHand = dto.qtyOnHand;
    } else {
      stock = stockRepo().create({
        warehouse,
        variant,
        qtyOnHand:   dto.qtyOnHand,
        qtyReserved: 0,
      });
    }

    const saved = await stockRepo().save(stock);
    await invalidate(CacheKeys.stockVariant(dto.variantId));
    await this._checkLowStockAlert(saved, variant);
    return saved;
  },

  async adjustStock(dto: z.infer<typeof AdjustStockSchema>, orgId: string): Promise<StockLevel> {
    return AppDataSource.transaction(async manager => {
      const stock = await manager.findOne(StockLevel, {
        where: {
          warehouse: { id: dto.warehouseId, org: { id: orgId } },
          variant:   { id: dto.variantId },
        },
        relations: ['variant', 'warehouse'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!stock) throw ApiError.notFound('Entrée stock');

      const newQty = stock.qtyOnHand + dto.delta;
      if (newQty < 0) throw ApiError.conflict(`Stock insuffisant (actuel: ${stock.qtyOnHand})`);

      stock.qtyOnHand = newQty;
      const saved = await manager.save(StockLevel, stock);
      await invalidate(CacheKeys.stockVariant(dto.variantId));

      // F3 — mouvement d'audit avant/après (même transaction)
      await recordStockMovement(manager, {
        variantId:   dto.variantId,
        warehouseId: dto.warehouseId,
        reason:      (dto.reason === 'transfer' ? 'correction' : dto.reason) as StockMovement['reason'],
        qtyDelta:    dto.delta,
        qtyBefore:   newQty - dto.delta,
        qtyAfter:    newQty,
        note:        dto.note,
      });

      return saved;
    });
  },

  async transfer(dto: z.infer<typeof TransferStockSchema>, orgId: string): Promise<{ from: StockLevel; to: StockLevel }> {
    return AppDataSource.transaction(async manager => {
      // Vérifier les deux entrepôts appartiennent à l'org
      const [fromWh, toWh] = await Promise.all([
        warehouseRepo().findOneBy({ id: dto.fromWarehouseId, org: { id: orgId } }),
        warehouseRepo().findOneBy({ id: dto.toWarehouseId,   org: { id: orgId } }),
      ]);
      if (!fromWh) throw ApiError.notFound('Entrepôt source');
      if (!toWh)   throw ApiError.notFound('Entrepôt destination');

      const fromStock = await manager.findOne(StockLevel, {
        where: { warehouse: { id: dto.fromWarehouseId }, variant: { id: dto.variantId } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!fromStock || fromStock.qtyAvailable < dto.quantity) {
        throw ApiError.conflict('Stock source insuffisant');
      }

      fromStock.qtyOnHand -= dto.quantity;
      await manager.save(StockLevel, fromStock);

      let toStock = await manager.findOne(StockLevel, {
        where: { warehouse: { id: dto.toWarehouseId }, variant: { id: dto.variantId } },
      });
      const toBefore = toStock?.qtyOnHand ?? 0;
      if (toStock) {
        toStock.qtyOnHand += dto.quantity;
      } else {
        toStock = manager.create(StockLevel, {
          warehouse: toWh,
          variant: { id: dto.variantId },
          qtyOnHand: dto.quantity,
          qtyReserved: 0,
        });
      }
      await manager.save(StockLevel, toStock);

      // F3 — deux mouvements liés (sortie source / entrée destination)
      await recordStockMovement(manager, {
        variantId: dto.variantId, warehouseId: dto.fromWarehouseId,
        reason: 'transfer_out', qtyDelta: -dto.quantity,
        qtyBefore: fromStock.qtyOnHand + dto.quantity, qtyAfter: fromStock.qtyOnHand,
        note: dto.note,
      });
      await recordStockMovement(manager, {
        variantId: dto.variantId, warehouseId: dto.toWarehouseId,
        reason: 'transfer_in', qtyDelta: dto.quantity,
        qtyBefore: toBefore, qtyAfter: toStock.qtyOnHand,
        note: dto.note,
      });

      await invalidate(CacheKeys.stockVariant(dto.variantId));

      return { from: fromStock, to: toStock };
    });
  },

  /** G6f — entrepôts actifs de l'organisation (listes de sélection). */
  async listWarehouses(orgId: string): Promise<Warehouse[]> {
    return warehouseRepo().find({ where: { org: { id: orgId }, isActive: true }, order: { name: 'ASC' } });
  },

  async getWarehouse(warehouseId: string, orgId: string): Promise<Warehouse> {
    const wh = await warehouseRepo().findOne({
      where: { id: warehouseId, org: { id: orgId } },
      relations: ['stockLevels'],
    });
    if (!wh) throw ApiError.notFound('Entrepôt');
    return wh;
  },

  async createWarehouse(orgId: string, dto: z.infer<typeof CreateWarehouseSchema>): Promise<Warehouse> {
    const wh = warehouseRepo().create({ ...dto, org: { id: orgId } });
    return warehouseRepo().save(wh);
  },

  async getLowStockAlerts(orgId: string) {
    return stockRepo()
      .createQueryBuilder('sl')
      .innerJoin('sl.warehouse', 'wh', 'wh.orgId = :orgId', { orgId })
      .innerJoinAndSelect('sl.variant', 'v')
      .innerJoinAndSelect('v.product', 'p')
      .where('sl.qty_on_hand - sl.qty_reserved <= v.reorderPoint')
      .orderBy('sl.qty_on_hand - sl.qty_reserved', 'ASC')
      .getMany();
  },

  async _checkLowStockAlert(stock: StockLevel, variant: ProductVariant) {
    if (stock.qtyAvailable <= (variant.reorderPoint ?? 5)) {
      await redis.publish('stock:low', JSON.stringify({
        variantId: variant.id,
        sku:       variant.variantSku,
        available: stock.qtyAvailable,
        threshold: variant.reorderPoint,
      }));
    }
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const Ctrl = {
  levels: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await StockService.getStockLevels(req.user!.orgId ?? undefined, req.query as any);
      res.json(ApiResponse.paginated(result));
    } catch (e) { next(e); }
  },
  set: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sl = await StockService.setStock(req.body, req.user!.orgId!);
      res.json(ApiResponse.success(sl, 'Stock mis à jour'));
    } catch (e) { next(e); }
  },
  adjust: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sl = await StockService.adjustStock(req.body, req.user!.orgId!);
      res.json(ApiResponse.success(sl, 'Ajustement effectué'));
    } catch (e) { next(e); }
  },
  transfer: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await StockService.transfer(req.body, req.user!.orgId!);
      res.json(ApiResponse.success(result, 'Transfert effectué'));
    } catch (e) { next(e); }
  },
  alerts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alerts = await StockService.getLowStockAlerts(req.user!.orgId!);
      res.json(ApiResponse.success(alerts));
    } catch (e) { next(e); }
  },
  createWarehouse: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wh = await StockService.createWarehouse(req.user!.orgId!, req.body);
      res.status(201).json(ApiResponse.created(wh));
    } catch (e) { next(e); }
  },
  // F3 — historique des mouvements (audit avant/après)
  movements: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query as any;
      const qb = AppDataSource.getRepository(StockMovement)
        .createQueryBuilder('m')
        .orderBy('m.createdAt', 'DESC');
      if (q.variantId)   qb.andWhere('m.variantId = :vid', { vid: q.variantId });
      if (q.warehouseId) qb.andWhere('m.warehouseId = :wid', { wid: q.warehouseId });
      if (q.reason)      qb.andWhere('m.reason = :reason', { reason: q.reason });
      if (q.orderId)     qb.andWhere('m.orderId = :oid', { oid: q.orderId });
      if (q.startDate)   qb.andWhere('m.createdAt >= :sd', { sd: q.startDate });
      if (q.endDate)     qb.andWhere('m.createdAt <= :ed', { ed: q.endDate });
      res.json(ApiResponse.paginated(await paginate(qb, +q.page || 1, Math.min(+q.limit || 50, 200))));
    } catch (e) { next(e); }
  },
  // F6 — prévisions de réapprovisionnement
  forecasts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const forecasts = await AppDataSource.getRepository(StockForecast)
        .createQueryBuilder('f')
        .where('f.orgId = :orgId', { orgId: req.user!.orgId })
        .orderBy('f.computedAt', 'DESC')
        .limit(200)
        .getMany();
      res.json(ApiResponse.success(forecasts));
    } catch (e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const stockRouter = Router();
stockRouter.use(authenticate, authorize('org_admin', 'super_admin', 'logistics'));

stockRouter.get('/',              validate(StockQuerySchema, 'query'), Ctrl.levels);
stockRouter.get('/alerts',        Ctrl.alerts);
stockRouter.get('/movements',     validate(MovementQuerySchema, 'query'), Ctrl.movements);
stockRouter.get('/forecasts',     Ctrl.forecasts);
stockRouter.post('/set',          validate(SetStockSchema),            Ctrl.set);
stockRouter.post('/adjust',       validate(AdjustStockSchema),         Ctrl.adjust);
stockRouter.post('/transfer',     validate(TransferStockSchema),       Ctrl.transfer);
stockRouter.get('/warehouses',    async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await StockService.listWarehouses(req.user!.orgId!))); } catch (e) { next(e); }
});
stockRouter.post('/warehouses',   validate(CreateWarehouseSchema),     Ctrl.createWarehouse);
