// ═══════════════════════════════════════════════════════════════
//  CATEGORIES — référentiel global (R2)
//  Lecture publique (arborescence à plat, front construit l'arbre).
//  CRUD super_admin uniquement. Suppression refusée si la catégorie
//  a des enfants ou des produits rattachés (409).
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { Category }      from '../../entities/Category';
import { Product }       from '../../entities/Product';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { generateSlug }  from '../../shared/utils/helpers';
import { cached, invalidate } from '../../config/redis';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateSchema = z.object({
  name:      z.string().min(2).max(100).trim(),
  parentId:  z.string().uuid().optional(),
  isActive:  z.boolean().default(true),
});

const UpdateSchema = z.object({
  name:     z.string().min(2).max(100).trim().optional(),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const repo = () => AppDataSource.getRepository(Category);

export const CategoriesService = {
  /** Liste à plat (le front construit l'arbre via parentId). */
  async list(activeOnly = false) {
    return cached('categories:all', async () => {
      const qb = repo().createQueryBuilder('c').orderBy('c.depth', 'ASC').addOrderBy('c.name', 'ASC');
      if (activeOnly) qb.andWhere('c.isActive = true');
      return qb.getMany();
    }, 300);
  },

  async create(dto: z.infer<typeof CreateSchema>) {
    // Profondeur : parentId +1, sinon racine
    let depth = 0;
    if (dto.parentId) {
      const parent = await repo().findOneBy({ id: dto.parentId });
      if (!parent) throw ApiError.notFound('Catégorie parente');
      depth = parent.depth + 1;
    }
    const saved = await repo().save(repo().create({
      name: dto.name,
      slug: `${generateSlug(dto.name)}-${Date.now().toString(36)}`, // unicité
      parentId: dto.parentId,
      depth,
      isActive: dto.isActive,
    }));
    invalidate('categories:all');
    return saved;
  },

  async update(id: string, dto: z.infer<typeof UpdateSchema>) {
    const cat = await repo().findOneByOrFail({ id });
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) throw ApiError.badRequest('Une catégorie ne peut pas être sa propre parente');
      if (dto.parentId) {
        const parent = await repo().findOneBy({ id: dto.parentId });
        if (!parent) throw ApiError.notFound('Catégorie parente');
        // Anti-cycle : remonter la chaîne des parents
        let cursor = parent;
        while (cursor.parentId) {
          if (cursor.parentId === id) throw ApiError.badRequest('Déplacement impossible : créerait une boucle');
          cursor = await repo().findOneByOrFail({ id: cursor.parentId });
        }
      }
      cat.parentId = dto.parentId ?? undefined;
      cat.depth    = dto.parentId ? (await repo().findOneByOrFail({ id: dto.parentId })).depth + 1 : 0;
    }
    if (dto.name)     cat.name     = dto.name;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;
    const saved = await repo().save(cat);
    invalidate('categories:all');
    return saved;
  },

  async remove(id: string) {
    const hasChildren = await repo().count({ where: { parentId: id } });
    if (hasChildren) throw ApiError.conflict('Supprimez d\'abord les sous-catégories');
    const products = await AppDataSource.getRepository(Product).count({ where: { categoryId: id } });
    if (products) throw ApiError.conflict(`${products} produit(s) rattaché(s) — réaffectez-les d'abord`);
    await repo().delete(id);
    invalidate('categories:all');
  },
};

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await CategoriesService.list(false))); } catch (e) { next(e); }
});

categoriesRouter.use(authenticate);

categoriesRouter.post('/',
  authorize('super_admin'),
  validate(CreateSchema),
  async (req, res, next) => {
    try { res.status(201).json(ApiResponse.created(await CategoriesService.create(req.body))); } catch (e) { next(e); }
  },
);
categoriesRouter.patch('/:id',
  authorize('super_admin'),
  validateParams('id'),
  validate(UpdateSchema),
  async (req, res, next) => {
    try { res.json(ApiResponse.success(await CategoriesService.update(req.params.id, req.body), 'Catégorie mise à jour')); } catch (e) { next(e); }
  },
);
categoriesRouter.delete('/:id',
  authorize('super_admin'),
  validateParams('id'),
  async (req, res, next) => {
    try { await CategoriesService.remove(req.params.id); res.json(ApiResponse.noContent()); } catch (e) { next(e); }
  },
);
