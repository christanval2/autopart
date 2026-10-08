// ═══════════════════════════════════════════════════════════════
//  ADMIN — configuration plateforme (fiscalité : TVA configurable)
//  GET /admin/tax-config   (super_admin)
//  PUT /admin/tax-config   (super_admin)
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { TaxConfig }        from '../../entities/TaxConfig';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, authorize } from '../../middlewares';

const PutTaxConfigSchema = z.object({
  /** Taux en pourcentage : 19.25 → stocké 0.1925 en base. */
  ratePercent:          z.number().min(0).max(100),
  countryCode:          z.string().length(2).default('CM'),
  isActive:             z.boolean().default(true),
  exemptedCategoryIds:  z.array(z.string().uuid()).default([]),
});

const taxRepo = () => AppDataSource.getRepository(TaxConfig);

function toDto(t: TaxConfig) {
  return {
    id:                  t.id,
    countryCode:         t.countryCode,
    rate:                Number(t.rate),
    /** Renvoyé aussi en pourcentage pour l'affichage direct (19.25). */
    ratePercent:         Number((Number(t.rate) * 100).toFixed(4)),
    isActive:            t.isActive,
    exemptedCategoryIds: t.exemptedCategoryIds ?? [],
    updatedAt:           t.updatedAt,
  };
}

export const TaxConfigService = {
  /** Config active du pays — crée la valeur par défaut TVA CM 19,25 % si absente. */
  async get(countryCode = 'CM'): Promise<TaxConfig> {
    let cfg = await taxRepo().findOne({
      where: { countryCode, isActive: true },
      order: { updatedAt: 'DESC' },
    });
    if (!cfg) {
      cfg = await taxRepo().save(taxRepo().create({
        countryCode,
        rate: 0.1925,
        isActive: true,
        exemptedCategoryIds: [],
      }));
    }
    return cfg;
  },

  async put(dto: z.infer<typeof PutTaxConfigSchema>): Promise<TaxConfig> {
    const existing = await taxRepo().findOne({
      where: { countryCode: dto.countryCode, isActive: true },
      order: { updatedAt: 'DESC' },
    });
    if (existing) {
      existing.rate = dto.ratePercent / 100;
      existing.isActive = dto.isActive;
      existing.exemptedCategoryIds = dto.exemptedCategoryIds;
      return taxRepo().save(existing);
    }
    return taxRepo().save(taxRepo().create({
      countryCode: dto.countryCode,
      rate: dto.ratePercent / 100,
      isActive: dto.isActive,
      exemptedCategoryIds: dto.exemptedCategoryIds,
    }));
  },
};

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get('/tax-config',
  authorize('super_admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ApiResponse.success(toDto(await TaxConfigService.get())));
    } catch (e) { next(e); }
  },
);

adminRouter.put('/tax-config',
  authorize('super_admin'),
  validate(PutTaxConfigSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const saved = await TaxConfigService.put(req.body as z.infer<typeof PutTaxConfigSchema>);
      res.json(ApiResponse.success(toDto(saved), 'Configuration TVA mise à jour'));
    } catch (e) { next(e); }
  },
);
