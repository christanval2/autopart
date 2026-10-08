// ── Promotions : chaque VENDEUR gère ses propres promotions ────
// L'admin ne gère plus les promotions : création / activation /
// suppression réservées aux rôles seller & org_admin, scopées à leur
// organisation (org_id). La validation des codes reste publique
// (checkout / panier).
import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { Promotion }     from '../../entities/Promotion';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreatePromoSchema = z.object({
  code:           z.string().min(3).max(50).trim().toUpperCase(),
  name:           z.string().min(3).max(200).trim(),
  type:           z.enum(['percentage','fixed','free_shipping','bogo']),
  scope:          z.enum(['all','category','product','org']).default('all'),
  discountValue:  z.number().positive(),
  minOrderAmount: z.number().min(0).default(0),
  maxUses:        z.number().int().positive().optional(),
  maxUsesPerUser: z.number().int().positive().default(1),
  validFrom:      z.coerce.date(),
  validUntil:     z.coerce.date(),
  scopeId:        z.string().uuid().optional(),
});

const ValidatePromoSchema = z.object({
  code:        z.string().min(1).toUpperCase(),
  orderAmount: z.number().positive(),
  userId:      z.string().uuid(),
});

const repo = () => AppDataSource.getRepository(Promotion);

export const PromotionsService = {
  async list(activeOnly = false) {
    const qb = repo().createQueryBuilder('p');
    if (activeOnly) qb.where('p.isActive = true AND p.validFrom <= :now AND p.validUntil >= :now', { now: new Date() });
    return qb.orderBy('p.createdAt','DESC').getMany();
  },

  /** Promotions de MON organisation (vue vendeur). */
  async listMine(orgId: string) {
    return repo().createQueryBuilder('p')
      .where('p.orgId = :orgId', { orgId })
      .orderBy('p.createdAt','DESC')
      .getMany();
  },

  async create(dto: z.infer<typeof CreatePromoSchema>, orgId: string) {
    const exists = await repo().findOneBy({ code: dto.code });
    if (exists) throw ApiError.conflict('Code promo déjà utilisé');
    return repo().save(repo().create({ ...dto, orgId }));
  },

  async validate(code: string, orderAmount: number, userId: string) {
    const promo = await repo().findOneBy({ code: code.toUpperCase(), isActive: true });
    if (!promo) throw ApiError.notFound('Code promo invalide');

    const now = new Date();
    if (now < promo.validFrom)   throw ApiError.badRequest('Code promo pas encore actif');
    if (now > promo.validUntil)  throw ApiError.badRequest('Code promo expiré');
    if (promo.maxUses && promo.usesCount >= promo.maxUses)
      throw ApiError.badRequest('Quota d\'utilisation atteint');
    if (orderAmount < promo.minOrderAmount)
      throw ApiError.badRequest(`Montant minimum requis : ${promo.minOrderAmount} XAF`);

    let discount = 0;
    switch (promo.type) {
      case 'percentage':    discount = orderAmount * (promo.discountValue / 100); break;
      case 'fixed':         discount = Math.min(promo.discountValue, orderAmount); break;
      case 'free_shipping': discount = 0; break; // appliqué côté commande
      case 'bogo':          discount = orderAmount * 0.5; break;
    }

    return { valid: true, discount, type: promo.type, code: promo.code, name: promo.name };
  },

  async apply(code: string) {
    await repo().increment({ code }, 'usesCount', 1);
  },

  /** Activation/désactivation — uniquement la promo de SON org. */
  async toggle(id: string, orgId: string) {
    const promo = await repo().findOneByOrFail({ id });
    if (promo.orgId !== orgId) throw ApiError.forbidden('Cette promotion n\'appartient pas à votre organisation');
    promo.isActive = !promo.isActive;
    return repo().save(promo);
  },

  async remove(id: string, orgId: string) {
    const promo = await repo().findOneByOrFail({ id });
    if (promo.orgId !== orgId) throw ApiError.forbidden('Cette promotion n\'appartient pas à votre organisation');
    await repo().remove(promo);
  },
};

export const promotionsRouter = Router();

// Public : catalogue des promos actives + validation des codes (checkout)
promotionsRouter.get('/', async (req,res,next) => {
  try { res.json(ApiResponse.success(await PromotionsService.list(req.query.active === 'true'))); } catch(e){next(e);}
});
promotionsRouter.post('/validate', validate(ValidatePromoSchema), async (req,res,next) => {
  try { res.json(ApiResponse.success(await PromotionsService.validate(req.body.code, req.body.orderAmount, req.body.userId))); } catch(e){next(e);}
});

// Vendeur : gestion de SES promotions (scopée org côté serveur)
promotionsRouter.use(authenticate, authorize('seller','org_admin'));

promotionsRouter.get('/mine', async (req,res,next) => {
  try {
    if (!req.user!.orgId) return next(ApiError.forbidden('Compte organisation requis'));
    res.json(ApiResponse.success(await PromotionsService.listMine(req.user!.orgId)));
  } catch(e){next(e);}
});

promotionsRouter.post('/', validate(CreatePromoSchema), async (req,res,next) => {
  try {
    if (!req.user!.orgId) return next(ApiError.forbidden('Compte organisation requis'));
    res.status(201).json(ApiResponse.created(await PromotionsService.create(req.body, req.user!.orgId)));
  } catch(e){next(e);}
});

promotionsRouter.patch('/:id/toggle', validateParams('id'), async (req,res,next) => {
  try {
    if (!req.user!.orgId) return next(ApiError.forbidden('Compte organisation requis'));
    res.json(ApiResponse.success(await PromotionsService.toggle(req.params.id, req.user!.orgId), 'Promotion mise à jour'));
  } catch(e){next(e);}
});

promotionsRouter.delete('/:id', validateParams('id'), async (req,res,next) => {
  try {
    if (!req.user!.orgId) return next(ApiError.forbidden('Compte organisation requis'));
    await PromotionsService.remove(req.params.id, req.user!.orgId);
    res.json(ApiResponse.noContent());
  } catch(e){next(e);}
});
