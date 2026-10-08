import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { PriceContract }    from '../../entities/PriceContract';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateContractSchema = z.object({
  buyerOrgId:      z.string().uuid(),
  variantId:       z.string().uuid(),
  contractedPrice: z.number().positive(),
  minQty:          z.number().int().positive().default(1),
  maxQty:          z.number().int().positive().optional(),
  currency:        z.string().length(3).default('XAF'),
  validFrom:       z.coerce.date(),
  validUntil:      z.coerce.date(),
});

const repo = () => AppDataSource.getRepository(PriceContract);

export const PriceContractService = {
  async list(orgId: string) {
    return repo().find({
      where: [{ sellerOrg: { id: orgId } }, { buyerOrg: { id: orgId } }],
      relations: ['buyerOrg','sellerOrg','variant','variant.product'],
      order: { createdAt: 'DESC' },
    });
  },

  async create(sellerOrgId: string, dto: z.infer<typeof CreateContractSchema>) {
    if (new Date(dto.validUntil) <= new Date(dto.validFrom))
      throw ApiError.badRequest('La date de fin doit être après la date de début');
    const exists = await repo().findOne({
      where: { buyerOrg: { id: dto.buyerOrgId }, sellerOrg: { id: sellerOrgId }, variant: { id: dto.variantId }, isActive: true },
    });
    if (exists) throw ApiError.conflict('Un contrat actif existe déjà');
    return repo().save(repo().create({
      sellerOrg: { id: sellerOrgId }, buyerOrg: { id: dto.buyerOrgId },
      variant: { id: dto.variantId }, contractedPrice: dto.contractedPrice,
      minQty: dto.minQty, maxQty: dto.maxQty, currency: dto.currency,
      validFrom: dto.validFrom, validUntil: dto.validUntil,
    }));
  },

  async getContractedPrice(buyerOrgId: string, sellerOrgId: string, variantId: string, qty: number) {
    const now = new Date();
    const c   = await repo().findOne({
      where: { buyerOrg: { id: buyerOrgId }, sellerOrg: { id: sellerOrgId }, variant: { id: variantId }, isActive: true },
    });
    if (!c || now < c.validFrom || now > c.validUntil) return null;
    if (qty < c.minQty || (c.maxQty && qty > c.maxQty)) return null;
    return c.contractedPrice;
  },

  async deactivate(id: string, orgId: string) {
    const c = await repo().findOne({ where: { id, sellerOrg: { id: orgId } } });
    if (!c) throw ApiError.notFound('Contrat de prix');
    c.isActive = false;
    return repo().save(c);
  },
};

export const priceContractsRouter = Router();
priceContractsRouter.use(authenticate);
priceContractsRouter.get('/',    authorize('org_admin','seller','buyer','super_admin'), async (req,res,next) => { try { res.json(ApiResponse.success(await PriceContractService.list(req.user!.orgId!))); } catch(e){next(e);} });
priceContractsRouter.post('/',   authorize('seller','org_admin','super_admin'), validate(CreateContractSchema), async (req,res,next) => { try { if (!req.user!.orgId) return next(ApiError.badRequest('Organisation requise')); res.status(201).json(ApiResponse.created(await PriceContractService.create(req.user!.orgId, req.body))); } catch(e){next(e);} });
priceContractsRouter.delete('/:id', validateParams('id'), authorize('seller','org_admin','super_admin'), async (req,res,next) => { try { await PriceContractService.deactivate(req.params.id, req.user!.orgId!); res.json(ApiResponse.noContent()); } catch(e){next(e);} });
