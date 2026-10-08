// ═══════════════════════════════════════════════════════════════
//  SEARCH MODULE — Full-text + compatibilité véhicule
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                  from 'zod';
import axios                  from 'axios';
import { escapeLike } from '../../shared/utils/helpers';
import { AppDataSource }      from '../../config/database';
import { Product }            from '../../entities/Product';
import { SearchHistory }      from '../../entities/SearchHistory';
import { cached }             from '../../config/redis';
import { ApiResponse, ApiError } from '../../shared/utils/response';
import { env }               from '../../config/env';
import { logger }            from '../../shared/utils/logger';
import { validate, authenticate, perUserRateLimit, optionalAuthenticate } from '../../middlewares';
import { loadViewerCtx, loadTiers, decorateProducts, visibilityCondition, type ViewerCtx } from '../../shared/tier-pricing';

// ─── Schémas Zod ─────────────────────────────────────────────────

export const SearchSchema = z.object({
  q:          z.string().min(1).max(200),
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
  categoryId: z.string().uuid().optional(),
  brandId:    z.string().uuid().optional(),
  condition:  z.enum(['new','genuine_used','reconditioned']).optional(),
  minPrice:   z.coerce.number().min(0).optional(),
  maxPrice:   z.coerce.number().min(0).optional(),
});

export const VehicleSearchSchema = z.object({
  make:       z.string().min(1).max(80),
  model:      z.string().min(1).max(80),
  year:       z.coerce.number().int().min(1950).max(2100),
  engineCode: z.string().max(50).optional(),
  category:   z.string().optional(),
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
});

export const AutocompleteSchema = z.object({
  q:    z.string().min(2).max(100),
  type: z.enum(['product', 'brand', 'category', 'make', 'model']).default('product'),
});

// ─── Service ─────────────────────────────────────────────────────

const productRepo = () => AppDataSource.getRepository(Product);

export const SearchService = {

  /**
   * Recherche full-text PostgreSQL avec ts_vector
   * Priorise : SKU exact > OEM exact > full-text rank > price
   * Règles org_type : visibilité + grille de prix selon l'appelant
   * (cache désactivé pour les appelants organisés — résultats personnalisés).
   */
  async search(query: z.infer<typeof SearchSchema>, viewer: ViewerCtx) {
    const { q, page, limit, categoryId, brandId, condition, minPrice, maxPrice } = query;

    const run = async () => {
    const qb = productRepo()
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category',  'cat')
      .leftJoinAndSelect('p.brand',     'br')
      .leftJoinAndSelect('p.images',    'img', 'img.isPrimary = true')
      .leftJoinAndSelect('p.variants',  'v',   'v.isActive = true')
      .leftJoinAndSelect('p.org',       'sellerOrg')
      .where('p.isActive = true');

    // Règles org_type : visibilité catalogue selon l'appelant
    const vis = visibilityCondition(viewer);
    if (vis) qb.andWhere(vis.clause, vis.params);

    // Full-text search PostgreSQL — unaccent() des deux côtés : sans lui,
    // « filtre a huile » (saisi sans accent) exige le lexème 'a' absent du
    // vecteur du nom accentué (« à » = mot-outil supprimé) → zéro résultat.
    qb.andWhere(`
      (
        p.sku         ILIKE :exact   OR
        p.oemReference ILIKE :exact  OR
        to_tsvector('french', unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,'')))
          @@ plainto_tsquery('french', unaccent(:q))
      )
    `, { exact: `%${q}%`, q });

    if (categoryId) qb.andWhere('p.categoryId = :cat',    { cat: categoryId });
    if (brandId)    qb.andWhere('p.brandId = :brand',     { brand: brandId });
    if (condition)  qb.andWhere('p.condition = :cond',    { cond: condition });
    if (minPrice)   qb.andWhere('p.basePrice >= :minP',   { minP: minPrice });
    if (maxPrice)   qb.andWhere('p.basePrice <= :maxP',   { maxP: maxPrice });

    // Score de pertinence : exact match en premier, puis rang FTS.
    // NB : le CASE passe par un alias de SELECT — un ORDER BY raw multiligne
    // casse le chemin getManyAndCount de TypeORM (alias introuvable).
    qb.addSelect(
      '(CASE WHEN p.sku ILIKE :exactOrder THEN 0 WHEN p.oemReference ILIKE :exactOrder THEN 1 ELSE 2 END)',
      'relevance',
    );
    qb.orderBy('relevance', 'ASC').addOrderBy('p.basePrice', 'ASC');

    qb.setParameter('exactOrder', `%${q}%`);

    const [data, total] = await qb.skip((page-1)*limit).take(limit).getManyAndCount();

    // E6f — facettes avec compteurs calculées sur le résultat FILTRÉ
    // (hors pagination), pour alimenter les filtres du front
    const facets = await cached(`facets:${viewer.orgId ?? 'public'}:${q}:${categoryId ?? ''}:${brandId ?? ''}:${condition ?? ''}:${minPrice ?? ''}:${maxPrice ?? ''}`, async () => {
      const clone = productRepo()
        .createQueryBuilder('p')
        .leftJoin('p.org', 'sellerOrg')
        .where('p.isActive = true')
        .andWhere(`
          (
            p.sku         ILIKE :exact OR
            p.oemReference ILIKE :exact OR
            to_tsvector('french', unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,'')))
              @@ plainto_tsquery('french', unaccent(:q))
          )
        `, { exact: `%${q}%`, q });
      if (vis) clone.andWhere(vis.clause, vis.params);
      if (categoryId) clone.andWhere('p.categoryId = :cat',   { cat: categoryId });
      if (brandId)    clone.andWhere('p.brandId = :brand',     { brand: brandId });
      if (condition)  clone.andWhere('p.condition = :cond',    { cond: condition });
      if (minPrice)   clone.andWhere('p.basePrice >= :minP',  { minP: minPrice });
      if (maxPrice)   clone.andWhere('p.basePrice <= :maxP',  { maxP: maxPrice });

      const [categories, brands, priceRange] = await Promise.all([
        clone.clone()
          .select('p.categoryId', 'id')
          .addSelect('cat.name', 'name')
          .addSelect('COUNT(p.id)', 'count')
          .innerJoin('p.category', 'cat')
          .groupBy('p.categoryId').addGroupBy('cat.name')
          .getRawMany<{ id: string; name: string; count: string }>(),
        clone.clone()
          .select('p.brandId', 'id')
          .addSelect('br.name', 'name')
          .addSelect('COUNT(p.id)', 'count')
          .innerJoin('p.brand', 'br')
          .groupBy('p.brandId').addGroupBy('br.name')
          .getRawMany<{ id: string; name: string; count: string }>(),
        clone.clone()
          .select('MIN(p.basePrice)', 'min')
          .addSelect('MAX(p.basePrice)', 'max')
          .getRawOne<{ min: string; max: string }>(),
      ]);

      return {
        categories: categories.map(c => ({ id: c.id, name: c.name, count: Number(c.count) })),
        brands:     brands.map(b => ({ id: b.id, name: b.name, count: Number(b.count) })),
        priceRange: { min: Number(priceRange?.min ?? 0), max: Number(priceRange?.max ?? 0) },
      };
    }, 60);

      return { data, total, page, limit, facets };
    };

    // Cache uniquement pour les appelants sans organisation (catalogue
    // public identique pour tous) ; sinon résultats personnalisés.
    const result = viewer.orgId
      ? await run()
      : await cached(`search:${q}:${categoryId ?? ''}:${brandId ?? ''}:${condition ?? ''}:${minPrice ?? ''}:${maxPrice ?? ''}:${page}:${limit}`, run, 60);
    result.data = decorateProducts(result.data, viewer, await loadTiers()) as typeof result.data;
    return result;
  },

  /**
   * Recherche par véhicule : "toutes les pièces pour ma Toyota Hilux 2019"
   * Règles org_type : visibilité + grille de prix selon l'appelant.
   */
  async searchByVehicle(query: z.infer<typeof VehicleSearchSchema>, viewer: ViewerCtx) {
    const { make, model, year, engineCode, category, page, limit } = query;

    const run = async () => {
      const qb = productRepo()
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.category',        'cat')
        .leftJoinAndSelect('p.brand',           'br')
        .leftJoinAndSelect('p.images',          'img', 'img.isPrimary = true')
        .leftJoinAndSelect('p.variants',        'v',   'v.isActive = true')
        .leftJoinAndSelect('p.org',             'sellerOrg')
        .innerJoin('p.compatibilities',         'comp')
        .where('p.isActive = true')
        .andWhere('comp.make     ILIKE :make',  { make:  `%${make}%` })
        .andWhere('comp.model    ILIKE :model', { model: `%${model}%` })
        .andWhere(':year BETWEEN comp.yearFrom AND COALESCE(comp.yearTo, 9999)', { year });

      const vis = visibilityCondition(viewer);
      if (vis) qb.andWhere(vis.clause, vis.params);

      if (engineCode) {
        qb.andWhere('(comp.engineCode IS NULL OR comp.engineCode ILIKE :ec)', { ec: `%${engineCode}%` });
      }
      if (category) {
        qb.andWhere('cat.name ILIKE :cat', { cat: `%${category}%` });
      }

      qb.orderBy('cat.name', 'ASC').addOrderBy('p.name', 'ASC');

      const [data, total] = await qb.skip((page-1)*limit).take(limit).getManyAndCount();
      return { data, total, page, limit };
    };

    const result = viewer.orgId
      ? await run()
      : await cached(`search:vehicle:${make}:${model}:${year}:${engineCode ?? 'any'}:${category ?? 'all'}:${page}`, run, 120);
    result.data = decorateProducts(result.data, viewer, await loadTiers()) as typeof result.data;
    return result;
  },

  /**
   * Autocomplete rapide (suggestions en temps réel)
   * Règles org_type : les suggestions produit respectent la visibilité
   * catalogue de l'appelant (un invité ne voit que le catalogue public).
   */
  async autocomplete(q: string, type: string, viewer: ViewerCtx) {
    const run = () => {
      switch (type) {
        case 'product': {
          const qb = productRepo()
            .createQueryBuilder('p')
            .leftJoin('p.org', 'sellerOrg')
            .select(['p.id', 'p.name', 'p.sku', 'p.oemReference'])
            .where('p.isActive = true')
            .andWhere('(p.name ILIKE :q OR p.sku ILIKE :q OR p.oemReference ILIKE :q)', { q: `${q}%` })
            .limit(8);
          const vis = visibilityCondition(viewer);
          if (vis) qb.andWhere(vis.clause, vis.params);
          return qb.getMany();
        }
        case 'make':
          return AppDataSource.query(`
            SELECT DISTINCT make FROM product_compatibilities
            WHERE make ILIKE $1 ORDER BY make LIMIT 10
          `, [`${q}%`]);

        case 'model':
          return AppDataSource.query(`
            SELECT DISTINCT model FROM product_compatibilities
            WHERE model ILIKE $1 ORDER BY model LIMIT 10
          `, [`${q}%`]);

        default:
          return Promise.resolve([]);
      }
    };
    // Cache seulement pour les invités (visibilité publique identique)
    if (!viewer.orgId) {
      return cached(`autocomplete:${type}:${q.toLowerCase()}`, run, 60);
    }
    return run();
  },

  /**
   * Marques et modèles disponibles (pour le filtre véhicule)
   */
  async getVehicleMakes() {
    return cached('search:makes', async () => {
      return AppDataSource.query(`
        SELECT DISTINCT make, COUNT(*) as product_count
        FROM product_compatibilities pc
        JOIN products p ON p.id = pc.product_id AND p.is_active = true
        GROUP BY make ORDER BY make
      `);
    }, 3600); // Cache 1h
  },

   async getVehicleModels(make: string) {
    return cached(`search:models:${make.toLowerCase()}`, async () => {
      return AppDataSource.query(`
        SELECT DISTINCT model, MIN(year_from) as min_year, MAX(COALESCE(year_to, 2099)) as max_year
        FROM product_compatibilities
        WHERE make ILIKE $1
        GROUP BY model ORDER BY model
      `, [`%${make}%`]);
    }, 3600);
  },

  async getHistory(userId: string, limit = 20) {
    const historyRepo = AppDataSource.getRepository(SearchHistory);
    return historyRepo.find({
      where: { user: { id: userId } },
      order: { searchedAt: 'DESC' },
      take: limit,
    });
  },

  async clearHistory(userId: string): Promise<void> {
    const historyRepo = AppDataSource.getRepository(SearchHistory);
    await historyRepo.delete({ user: { id: userId } });
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const Ctrl = {
  search: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const viewer = await loadViewerCtx(req.user);
      const result = await SearchService.search(req.query as any, viewer);
      res.json(ApiResponse.paginated(result));
    } catch(e){next(e);}
  },
  byVehicle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const viewer = await loadViewerCtx(req.user);
      const result = await SearchService.searchByVehicle(req.query as any, viewer);
      res.json(ApiResponse.paginated(result));
    } catch(e){next(e);}
  },
  autocomplete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, type } = req.query as { q: string; type: string };
      const viewer = await loadViewerCtx(req.user);
      const results = await SearchService.autocomplete(q, type ?? 'product', viewer);
      res.json(ApiResponse.success(results));
    } catch(e){next(e);}
  },
  makes: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await SearchService.getVehicleMakes())); } catch(e){next(e);}
  },
  models: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await SearchService.getVehicleModels(req.params.make))); } catch(e){next(e);}
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const searchRouter = Router();

searchRouter.get('/',                optionalAuthenticate, validate(SearchSchema, 'query'),        Ctrl.search);
searchRouter.get('/vehicle',         optionalAuthenticate, validate(VehicleSearchSchema, 'query'), Ctrl.byVehicle);
searchRouter.get('/autocomplete',    optionalAuthenticate, validate(AutocompleteSchema, 'query'),  Ctrl.autocomplete);
searchRouter.get('/vehicle/makes',                                            Ctrl.makes);
searchRouter.get('/vehicle/models/:make',                                     Ctrl.models);

// Historique de recherche (srch-5)
searchRouter.get('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await SearchService.getHistory(req.user!.id, +req.query.limit!||20))); } catch(e){next(e);}
});
searchRouter.delete('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try { await SearchService.clearHistory(req.user!.id); res.json(ApiResponse.noContent()); } catch(e){next(e);}
});

// ─── F6.3 : recherche par image (AI vision) ─────────────────────
import multer        from 'multer';

const imageSearchUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Image JPEG/PNG/WebP attendue'));
  },
});

/**
 * POST /search/by-image — identification d'une pièce par photo.
 * Dépend d'une API vision externe (VISION_API_URL/KEY, format OpenAI chat).
 * Fallback contractuel : sans clé configurée → 422 avec message clair
 * invitant à la recherche textuelle (jamais d'erreur 500 confuse).
 */
searchRouter.post('/by-image',
  authenticate,
  perUserRateLimit('by-image', 10, 3600),
  imageSearchUpload.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next(ApiError.badRequest('Aucune image envoyée'));
      if (!env.VISION_API_URL || !env.VISION_API_KEY) {
        return next(ApiError.unprocessable(
          'Recherche par image non disponible — utilisez la recherche par nom, SKU ou référence OEM',
        ));
      }

      const b64 = req.file.buffer.toString('base64');
      const { data } = await axios.post(
        `${env.VISION_API_URL.replace(/\/$/, '')}/chat/completions`,
        {
          model: env.VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Identifie cette pièce automobile en 1 ligne au format : "catégorie | mots-clés de recherche | référence OEM si visible". Réponds uniquement cette ligne.' },
              { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${b64}` } },
            ],
          }],
          max_tokens: 100,
        },
        { headers: { Authorization: `Bearer ${env.VISION_API_KEY}` }, timeout: 20_000 },
      );

      const description: string = String(data?.choices?.[0]?.message?.content ?? '').trim();
      if (!description) throw ApiError.badRequest('Impossible d\'identifier la pièce sur cette photo');

      // Recherche full-text avec les termes extraits (fallback textuel intégré)
      const result = await SearchService.search({
        q: description.slice(0, 200), page: 1, limit: 12,
      } as any, await loadViewerCtx(req.user));

      res.json(ApiResponse.success({
        extractedTerms: description,
        results: result.data,
        total: result.total,
      }, 'Résultats basés sur l\'identification IA — vérifiez la compatibilité'));
    } catch (e: any) {
      if (axios.isAxiosError(e)) {
        logger.warn('Vision API error:', e.message);
        return next(ApiError.unprocessable('Identification impossible pour le moment — utilisez la recherche textuelle'));
      }
      next(e);
    }
  },
);
