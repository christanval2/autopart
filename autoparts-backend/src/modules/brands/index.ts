// ═══════════════════════════════════════════════════════════════
//  BRANDS — référentiel global (R2)
//  Lecture publique. CRUD super_admin. Unicité du nom.
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { Brand }         from '../../entities/Brand';
import { Product }       from '../../entities/Product';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { cached, invalidate } from '../../config/redis';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateSchema = z.object({
  name:             z.string().min(1).max(100).trim(),
  countryOfOrigin:  z.string().length(2).optional(),
  isOem:            z.boolean().default(false),
});

const UpdateSchema = z.object({
  name:             z.string().min(1).max(100).trim().optional(),
  countryOfOrigin:  z.string().length(2).nullable().optional(),
  isOem:            z.boolean().optional(),
  isActive:         z.boolean().optional(),
});

const repo = () => AppDataSource.getRepository(Brand);

export const BrandsService = {
  async list(activeOnly = false) {
    return cached('brands:all', async () => {
      const qb = repo().createQueryBuilder('b').orderBy('b.name', 'ASC');
      if (activeOnly) qb.andWhere('b.isActive = true');
      return qb.getMany();
    }, 300);
  },

  async create(dto: z.infer<typeof CreateSchema>) {
    const exists = await repo().findOne({ where: { name: dto.name } });
    if (exists) throw ApiError.conflict(`Marque « ${dto.name} » déjà existante`);
    const saved = await repo().save(repo().create(dto));
    invalidate('brands:all');
    return saved;
  },

  async update(id: string, dto: z.infer<typeof UpdateSchema>) {
    const brand = await repo().findOneByOrFail({ id });
    if (dto.name && dto.name !== brand.name) {
      const exists = await repo().findOne({ where: { name: dto.name } });
      if (exists) throw ApiError.conflict(`Marque « ${dto.name} » déjà existante`);
    }
    Object.assign(brand, dto);
    const saved = await repo().save(brand);
    invalidate('brands:all');
    return saved;
  },

  async remove(id: string) {
    const products = await AppDataSource.getRepository(Product).count({ where: { brandId: id } });
    if (products) throw ApiError.conflict(`${products} produit(s) rattaché(s) — désactivez la marque plutôt que la supprimer`);
    await repo().delete(id);
    invalidate('brands:all');
  },
};

export const brandsRouter = Router();

brandsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await BrandsService.list(false))); } catch (e) { next(e); }
});

brandsRouter.use(authenticate);

brandsRouter.post('/',
  authorize('super_admin'),
  validate(CreateSchema),
  async (req, res, next) => {
    try { res.status(201).json(ApiResponse.created(await BrandsService.create(req.body))); } catch (e) { next(e); }
  },
);
brandsRouter.patch('/:id',
  authorize('super_admin'),
  validateParams('id'),
  validate(UpdateSchema),
  async (req, res, next) => {
    try { res.json(ApiResponse.success(await BrandsService.update(req.params.id, req.body), 'Marque mise à jour')); } catch (e) { next(e); }
  },
);
brandsRouter.delete('/:id',
  authorize('super_admin'),
  validateParams('id'),
  async (req, res, next) => {
    try { await BrandsService.remove(req.params.id); res.json(ApiResponse.noContent()); } catch (e) { next(e); }
  },
);
