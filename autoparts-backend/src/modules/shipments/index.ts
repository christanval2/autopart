import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import QRCode               from 'qrcode';
import { AppDataSource }    from '../../config/database';
import { Shipment }         from '../../entities/Shipment';
import { Order }            from '../../entities/Order';
import { Warehouse }        from '../../entities/Warehouse';
import { AuditLog }         from '../../entities/AuditLog';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate, generateOTP } from '../../shared/utils/helpers';
import { validate, validateParams, authenticate, authorize } from '../../middlewares';

// ─── Schémas ─────────────────────────────────────────────────
const CreateShipmentSchema = z.object({
  orderId:        z.string().uuid(),
  warehouseId:    z.string().uuid().optional(),
  trackingNumber: z.string().max(100).optional(),
  carrier:        z.string().max(80).optional(),
  parcelInfo:     z.object({
    weightKg:   z.number().optional(),
    dimensions: z.string().optional(),
    nbColis:    z.number().int().min(1).default(1),
  }).optional(),
});

const UpdateShipmentSchema = z.object({
  status:         z.enum(['preparing','in_transit','out_for_delivery','delivered','returned']).optional(),
  trackingNumber: z.string().max(100).optional(),
  carrier:        z.string().max(80).optional(),
  shippedAt:      z.coerce.date().optional(),
  deliveredAt:    z.coerce.date().optional(),
  parcelInfo:     z.object({
    weightKg:   z.number().optional(),
    dimensions: z.string().optional(),
    nbColis:    z.number().int().min(1).optional(),
  }).optional(),
});

const ShipmentQuerySchema = z.object({
  page:    z.coerce.number().int().positive().default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  orderId: z.string().uuid().optional(),
  status:  z.enum(['preparing','in_transit','out_for_delivery','delivered','returned']).optional(),
});

// ─── Service ─────────────────────────────────────────────────
const shipRepo  = () => AppDataSource.getRepository(Shipment);
const orderRepo = () => AppDataSource.getRepository(Order);
const whRepo    = () => AppDataSource.getRepository(Warehouse);

// Transitions d'états autorisées
const TRANSITIONS: Record<string, string[]> = {
  preparing:          ['in_transit', 'returned'],
  in_transit:         ['out_for_delivery', 'returned'],
  out_for_delivery:   ['delivered', 'returned'],
  delivered:          [],
  returned:           [],
};

export const ShipmentsService = {
  /** orgId null (super_admin) → toutes les expéditions (vue logistique globale). */
  async list(orgId: string | null, query: z.infer<typeof ShipmentQuerySchema>) {
    const qb = shipRepo()
      .createQueryBuilder('s')
      // order + adresse inclus : le front trace le trajet sans appel N+1
      .innerJoinAndSelect('s.order', 'o')
      .leftJoinAndSelect('s.warehouse', 'w')
      .leftJoinAndSelect('o.shippingAddress', 'sa');

    if (orgId) qb.where('o.sellerOrg.id = :orgId', { orgId });

    if (query.orderId) qb.andWhere('s.order.id = :oid', { oid: query.orderId });
    if (query.status)  qb.andWhere('s.status = :st',   { st:  query.status });

    qb.orderBy('s.shippedAt', 'DESC');
    return paginate(qb, query.page, query.limit);
  },

  async findById(id: string) {
    const s = await shipRepo().findOne({
      where: { id },
      relations: ['order', 'order.buyer', 'warehouse'],
    });
    if (!s) throw ApiError.notFound('Expédition');
    return s;
  },

  async create(dto: z.infer<typeof CreateShipmentSchema>, orgId: string) {
    // Vérifier que la commande appartient à l'org
    const order = await orderRepo().findOne({
      where: { id: dto.orderId, sellerOrg: { id: orgId } },
    });
    if (!order) throw ApiError.notFound('Commande');
    if (!['confirmed','processing'].includes(order.status)) {
      throw ApiError.badRequest(`Impossible de créer une expédition pour une commande en statut "${order.status}"`);
    }

    const warehouse = dto.warehouseId
      ? await whRepo().findOneBy({ id: dto.warehouseId, org: { id: orgId } })
      : undefined;

    const shipment = shipRepo().create({
      order:          { id: dto.orderId },
      warehouse:      warehouse ?? undefined,
      trackingNumber: dto.trackingNumber,
      carrier:        dto.carrier,
      parcelInfo:     dto.parcelInfo,
      status:         'preparing',
    });

    const saved = await shipRepo().save(shipment);

    // Mettre à jour le statut de la commande → processing
    if (order.status === 'confirmed') {
      await orderRepo().update(dto.orderId, { status: 'processing' });
    }

    return saved;
  },

  async update(id: string, dto: z.infer<typeof UpdateShipmentSchema>, orgId: string) {
    const shipment = await this.findById(id);

    // Vérifier propriété
    if ((shipment.order as any)?.sellerOrg?.id !== orgId &&
        !(await orderRepo().findOne({ where: { id: (shipment.order as any).id, sellerOrg: { id: orgId } } }))) {
      throw ApiError.forbidden();
    }

    // Valider la transition de statut
    if (dto.status && dto.status !== shipment.status) {
      const allowed = TRANSITIONS[shipment.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw ApiError.badRequest(`Transition ${shipment.status} → ${dto.status} non autorisée`);
      }

      // Side effects sur la commande
      if (dto.status === 'in_transit' || dto.status === 'out_for_delivery') {
        await orderRepo().update((shipment.order as any).id, { status: 'shipped' });
        if (!dto.shippedAt) dto.shippedAt = new Date();
      }
      if (dto.status === 'delivered') {
        await orderRepo().update((shipment.order as any).id, { status: 'delivered' });
        if (!dto.deliveredAt) dto.deliveredAt = new Date();
      }
    }

    Object.assign(shipment, dto);
    return shipRepo().save(shipment);
  },

  async publicTrack(trackingNumber: string) {
    // Relations nécessaires au trajet sur carte (client) : ville de l'entrepôt
    // d'origine + ville de livraison. Aucune donnée personnelle exposée.
    const s = await shipRepo().findOne({
      where: { trackingNumber },
      relations: ['warehouse', 'order', 'order.shippingAddress'],
    });
    if (!s) throw ApiError.notFound('Expédition introuvable avec ce numéro de suivi');

    const addr = (s.order as any)?.shippingAddress;
    // Progression estimée du colis origine → destination (0→1) selon le statut
    const PROGRESS: Record<string, number> = {
      preparing: 0.05,
      in_transit: 0.5,
      out_for_delivery: 0.85,
      delivered: 1,
      returned: 0,
    };
    return {
      id:             s.id,
      trackingNumber: s.trackingNumber,
      carrier:        s.carrier,
      status:         s.status,
      shippedAt:      s.shippedAt,
      deliveredAt:    s.deliveredAt,
      // Trajet (public) — villes uniquement
      originCity:       s.warehouse?.city ?? null,
      originWarehouse:  s.warehouse?.name ?? null,
      destinationCity:  addr?.city ?? null,
      destinationLabel: [addr?.street, addr?.city].filter(Boolean).join(', ') || null,
      progress:         PROGRESS[s.status] ?? 0,
      parcelInfo:       s.parcelInfo ?? null,
    };
  },
};

// ─── Contrôleur ──────────────────────────────────────────────
const Ctrl = {
  list:    async (req: Request, res: Response, next: NextFunction) => {
    // super_admin sans org → null → vue globale (carte logistique)
    const isSuper = req.user!.roles?.includes('super_admin') ?? false;
    const orgId = isSuper ? null : req.user!.orgId ?? null;
    try { res.json(ApiResponse.paginated(await ShipmentsService.list(orgId, req.query as any))); } catch(e){next(e);}
  },
  getOne:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await ShipmentsService.findById(req.params.id))); } catch(e){next(e);}
  },
  create:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(ApiResponse.created(await ShipmentsService.create(req.body, req.user!.orgId!))); } catch(e){next(e);}
  },
  update:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await ShipmentsService.update(req.params.id, req.body, req.user!.orgId!), 'Expédition mise à jour')); } catch(e){next(e);}
  },
  track:   async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await ShipmentsService.publicTrack(req.params.trackingNumber))); } catch(e){next(e);}
  },
};

// ─── Routes ──────────────────────────────────────────────────
export const shipmentsRouter = Router();

// Route publique pour le suivi de colis
shipmentsRouter.get('/track/:trackingNumber', Ctrl.track);

// Routes protégées
shipmentsRouter.use(authenticate);
shipmentsRouter.get('/',      authorize('seller','org_admin','logistics','super_admin'), validate(ShipmentQuerySchema, 'query'), Ctrl.list);
shipmentsRouter.get('/:id',   authorize('seller','org_admin','logistics','super_admin'), Ctrl.getOne);
shipmentsRouter.post('/',     authorize('seller','org_admin','logistics'), validate(CreateShipmentSchema), Ctrl.create);
shipmentsRouter.patch('/:id', authorize('seller','org_admin','logistics','super_admin'), validate(UpdateShipmentSchema), Ctrl.update);


// ─── Click & Collect (shp-3) ──────────────────────────────────

const ClickCollectSchema = z.object({
  orderId:     z.string().uuid(),
  warehouseId: z.string().uuid(),
  pickupDate:  z.coerce.date(),
  contactPhone:z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
});

export const ClickCollectService = {
  async schedule(dto: z.infer<typeof ClickCollectSchema>) {
    // Crée une expédition de type "click & collect" sans transporteur
    // + un code de retrait court (présenté en QR par l'acheteur, F3)
    const pickupCode = `PK-${generateOTP(6)}`;
    const shipment = await ShipmentsService.create(
      {
        orderId:        dto.orderId,
        warehouseId:    dto.warehouseId,
        carrier:        'CLICK_AND_COLLECT',
        trackingNumber: `CC-${dto.orderId.slice(0,8).toUpperCase()}`,
      },
      undefined as any,
    );
    shipment.pickupCode = pickupCode;
    await shipRepo().update(shipment.id, { pickupCode });
    return { ...shipment, pickupDate: dto.pickupDate, contactPhone: dto.contactPhone };
  },

  /** QR PNG du code de retrait — réservé à l'acheteur de la commande. */
  async pickupQr(orderId: string, callerId: string, isAdmin: boolean): Promise<Buffer> {
    const shipment = await shipRepo().findOne({
      where: { order: { id: orderId } },
      relations: ['order'],
    });
    if (!shipment?.pickupCode) throw ApiError.notFound('Code de retrait');
    if (!isAdmin && (shipment.order as any).buyer?.id !== callerId) throw ApiError.forbidden();
    return QRCode.toBuffer(`AUTOPARTS-PICKUP:${shipment.pickupCode}`, { width: 300, margin: 2 });
  },

  /** Validation en boutique par le vendeur : scan du code → commande livrée. */
  async validatePickup(orderId: string, code: string, userId: string, orgId?: string | null): Promise<Shipment> {
    const shipment = await shipRepo().findOne({
      where: { order: { id: orderId } },
      relations: ['order', 'order.sellerOrg'],
    });
    if (!shipment || !shipment.pickupCode) throw ApiError.notFound('Retrait Click & Collect');
    if (shipment.pickupCode !== code.trim().toUpperCase()) throw ApiError.badRequest('Code de retrait invalide');
    // Seul le vendeur de la commande (ou un admin) valide le retrait
    if (orgId && (shipment.order as any).sellerOrg?.id !== orgId) throw ApiError.forbidden();

    shipment.status = 'delivered';
    shipment.deliveredAt = new Date();
    const saved = await shipRepo().save(shipment);

    const order = shipment.order as any;
    if (order && !['delivered','refunded','cancelled'].includes(order.status)) {
      await AppDataSource.getRepository(Order).update(order.id, { status: 'delivered' });
    }
    // Audit du retrait (F3)
    await AppDataSource.getRepository(AuditLog).save(
      AppDataSource.getRepository(AuditLog).create({
        actor: { id: userId } as any,
        action: 'PICKUP_VALIDATED',
        entity: 'Order',
        entityId: order?.id,
      }),
    );
    return saved;
  },
};

shipmentsRouter.post('/click-collect',
  authenticate,
  authorize('buyer','org_admin','super_admin'),
  validate(ClickCollectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ApiResponse.created(await ClickCollectService.schedule(req.body)));
    } catch(e) { next(e); }
  },
);

// F3 — QR du code de retrait (acheteur) + validation boutique (vendeur)
shipmentsRouter.get('/pickup/:orderId/qr',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.roles.includes('super_admin');
      const png = await ClickCollectService.pickupQr(req.params.orderId, req.user!.id, isAdmin);
      res.setHeader('Content-Type', 'image/png');
      res.send(png);
    } catch(e) { next(e); }
  },
);

const PickupValidateSchema = z.object({ code: z.string().min(4).max(12) });
shipmentsRouter.post('/pickup/:orderId/validate',
  authenticate,
  authorize('seller', 'logistics', 'org_admin', 'super_admin'),
  validate(PickupValidateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const saved = await ClickCollectService.validatePickup(
        req.params.orderId, req.body.code, req.user!.id, req.user!.orgId,
      );
      res.json(ApiResponse.success(saved, 'Retrait validé — commande livrée'));
    } catch(e) { next(e); }
  },
);
