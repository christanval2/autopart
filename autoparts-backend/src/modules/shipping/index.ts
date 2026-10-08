// ═══════════════════════════════════════════════════════════════
//  SHIPPING MODULE (F2) — zones de livraison et calcul des frais.
//  Remplace le shippingCost: 0 codé en dur du checkout.
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { ShippingZone }     from '../../entities/ShippingZone';
import { Organization }     from '../../entities/Organization';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, validateParams, authenticate, authorize } from '../../middlewares';

const ZoneSchema = z.object({
  name:                 z.string().min(2).max(100),
  zoneType:             z.enum(['city', 'national', 'international']),
  flatRate:             z.number().min(0).default(0),
  ratePerKg:            z.number().min(0).default(0),
  freeThreshold:        z.number().min(0).optional(),
  estimatedDays:        z.number().int().min(0).max(90).optional(),
  isExpress:            z.boolean().default(false),
  expressSurchargePct:  z.number().min(0).max(100).default(0),
});

const zoneRepo = () => AppDataSource.getRepository(ShippingZone);

export const ShippingService = {
  /** Toutes les zones (super_admin, back-office). */
  async listAll() {
    return zoneRepo().find();
  },

  async listByOrg(orgId: string) {
    return zoneRepo().find({ where: { org: { id: orgId }, isActive: true }, order: { name: 'ASC' } });
  },

  async create(orgId: string, dto: z.infer<typeof ZoneSchema>) {
    return zoneRepo().save(zoneRepo().create({ ...dto, org: { id: orgId } } as any));
  },

  async update(zoneId: string, orgId: string, dto: Partial<z.infer<typeof ZoneSchema>>) {
    const zone = await zoneRepo().findOne({ where: { id: zoneId, org: { id: orgId } } });
    if (!zone) throw ApiError.notFound('Zone de livraison');
    Object.assign(zone, dto);
    return zoneRepo().save(zone);
  },

  async remove(zoneId: string, orgId: string) {
    const zone = await zoneRepo().findOne({ where: { id: zoneId, org: { id: orgId } } });
    if (!zone) throw ApiError.notFound('Zone de livraison');
    await zoneRepo().remove(zone);
  },

  /**
   * Calcul des frais : fixe + tarif×poids ; 0 si total ≥ seuil gratuit ;
   * surcharge express en %. Retourne null si la zone n'existe pas.
   */
  computeCost(zone: ShippingZone, orderValue: number, totalWeightKg: number): number {
    let cost = Number(zone.flatRate);
    if (totalWeightKg > 0) cost += Number(zone.ratePerKg) * totalWeightKg;
    if (zone.isExpress && Number(zone.expressSurchargePct) > 0) {
      cost *= 1 + Number(zone.expressSurchargePct) / 100;
    }
    if (zone.freeThreshold != null && orderValue >= Number(zone.freeThreshold)) {
      cost = 0;
    }
    return Math.round(cost);
  },

  /** Simulation publique pour le front : coûts de toutes les zones du vendeur. */
  async quote(sellerOrgId: string, orderValue: number, totalWeightKg: number) {
    const zones = await this.listByOrg(sellerOrgId);
    return zones.map(zone => ({
      zoneId:        zone.id,
      name:          zone.name,
      zoneType:      zone.zoneType,
      estimatedDays: zone.estimatedDays,
      isExpress:     zone.isExpress,
      freeShipping:  zone.freeThreshold != null && orderValue >= Number(zone.freeThreshold),
      cost:          this.computeCost(zone, orderValue, totalWeightKg),
    }));
  },
};

export const shippingRouter = Router();

// Simulation publique (checkout avant connexion complète)
const QuoteSchema = z.object({
  sellerOrgId: z.string().uuid(),
  orderValue:  z.coerce.number().min(0),
  weightKg:    z.coerce.number().min(0).default(0),
});
shippingRouter.get('/quote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = QuoteSchema.parse(req.query);
    res.json(ApiResponse.success(await ShippingService.quote(q.sellerOrgId, q.orderValue, q.weightKg)));
  } catch (e) { next(e); }
});

shippingRouter.use(authenticate);

shippingRouter.get('/zones', async (req, res, next) => {
  try {
    if (req.user!.roles.includes('super_admin')) {
      return res.json(ApiResponse.success(await ShippingService.listAll()));
    }
    if (!req.user!.orgId) throw ApiError.forbidden('Réservé aux organisations');
    res.json(ApiResponse.success(await ShippingService.listByOrg(req.user!.orgId)));
  } catch (e) { next(e); }
});
shippingRouter.post('/zones',
  authorize('seller', 'org_admin', 'super_admin'),
  validate(ZoneSchema),
  async (req, res, next) => {
    try {
      let orgId = req.user!.orgId;
      if (req.user!.roles.includes('super_admin')) {
        orgId = req.body.orgId ?? orgId ?? (await AppDataSource.getRepository(Organization).find({ order: { name: 'ASC' }, take: 1 }))[0]?.id;
      }
      if (!orgId) throw ApiError.forbidden('Réservé aux organisations');
      res.status(201).json(ApiResponse.created(await ShippingService.create(orgId, req.body)));
    } catch (e) { next(e); }
  },
);
shippingRouter.patch('/zones/:id', validateParams('id'), async (req, res, next) => {
  try {
    if (!req.user!.orgId) throw ApiError.forbidden('Réservé aux organisations');
    res.json(ApiResponse.success(await ShippingService.update(req.params.id, req.user!.orgId, ZoneSchema.partial().parse(req.body))));
  } catch (e) { next(e); }
});
shippingRouter.delete('/zones/:id', validateParams('id'), authorize('seller', 'org_admin', 'super_admin'), async (req, res, next) => {
  try {
    if (!req.user!.orgId) throw ApiError.forbidden('Réservé aux organisations');
    await ShippingService.remove(req.params.id, req.user!.orgId);
    res.json(ApiResponse.noContent());
  } catch (e) { next(e); }
});
