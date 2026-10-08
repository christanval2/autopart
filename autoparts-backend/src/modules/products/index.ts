// ═══════════════════════════════════════════════════════════════
//  PRODUCTS MODULE
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                 from 'zod';
import Papa                  from 'papaparse';
import multer                from 'multer';
import { AppDataSource }     from '../../config/database';
import { cached, invalidate, CacheKeys } from '../../config/redis';
import { Product }           from '../../entities/Product';
import { ProductVariant }    from '../../entities/ProductVariant';
import { PriceHistory }      from '../../entities/PriceHistory';
import { ProductCompatibility } from '../../entities/ProductCompatibility';
import { StockLevel }        from '../../entities/StockLevel';
import { Organization }      from '../../entities/Organization';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate, escapeLike, safeOrderBy, SORT_COLS }          from '../../shared/utils/helpers';
import { generateSlug }      from '../../shared/utils/helpers';
import { validate, validateParams, authenticate, authorize, optionalAuthenticate } from '../../middlewares';
import { canSellAs, DEFAULT_MOQ_BY_ORG_TYPE, type OrgType } from '../../shared/org-rules';
import { loadViewerCtx, loadTiers, decorateProducts, isProductVisible, visibilityCondition, type ViewerCtx } from '../../shared/tier-pricing';

// ─── Schémas Zod ─────────────────────────────────────────────────

const DimensionsSchema = z.object({
  length: z.number().positive(),
  width:  z.number().positive(),
  height: z.number().positive(),
}).optional();

export const CreateProductSchema = z.object({
  sku:           z.string().min(3).max(100),
  oemReference:  z.string().max(100).optional(),
  name:          z.string().min(2).max(255),
  description:   z.string().max(5000).optional(),
  categoryId:    z.string().uuid(),
  brandId:       z.string().uuid(),
  basePrice:     z.number().positive(),
  currency:      z.string().length(3).default('XAF'),
  weightKg:      z.number().positive().optional(),
  dimensionsCm:  DimensionsSchema,
  condition:     z.enum(['new', 'genuine_used', 'reconditioned']).default('new'),
  // Règles org_type — MOQ produit (null = pas de MOQ) et visibilité
  // catalogue public. Défauts posés à la création selon org_type du
  // vendeur (importer 50, wholesaler 5), modifiables ensuite.
  minOrderQty:   z.number().int().min(1).max(1_000_000).nullable().optional(),
  publicListing: z.boolean().optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const CreateVariantSchema = z.object({
  variantSku:    z.string().min(3).max(120),
  attributes:    z.record(z.string()),               // { position:'left', diameter:'280mm' }
  priceOverride: z.number().positive().optional(),
  costPrice:     z.number().positive(),
  reorderPoint:  z.number().int().min(0).default(5),
});

export const CreateCompatibilitySchema = z.object({
  make:       z.string().min(1).max(80),
  model:      z.string().min(1).max(80),
  yearFrom:   z.number().int().min(1950).max(2100),
  yearTo:     z.number().int().optional(),
  engineCode: z.string().max(50).optional(),
});

export const ProductQuerySchema = z.object({
  // R1 — vue vendeur : uniquement les produits de mon organisation
  mine:        z.coerce.boolean().optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  search:       z.string().max(200).optional(),
  categoryId:   z.string().uuid().optional(),
  brandId:      z.string().uuid().optional(),
  condition:    z.enum(['new', 'genuine_used', 'reconditioned']).optional(),
  minPrice:     z.coerce.number().min(0).optional(),
  maxPrice:     z.coerce.number().min(0).optional(),
  make:         z.string().optional(),         // filtre compatibilité
  model:        z.string().optional(),
  year:         z.coerce.number().optional(),
  sortBy:       z.enum(['name', 'basePrice', 'createdAt'] as const).default('createdAt'),
  sortDir:      z.enum(['ASC', 'DESC']).default('DESC'),
  inStock:      z.coerce.boolean().optional(),
});

export type CreateProductDto = z.infer<typeof CreateProductSchema>;
export type ProductQuery     = z.infer<typeof ProductQuerySchema>;

// ─── Service ─────────────────────────────────────────────────────

const repo    = () => AppDataSource.getRepository(Product);
const varRepo = () => AppDataSource.getRepository(ProductVariant);
const compRepo= () => AppDataSource.getRepository(ProductCompatibility);

export const ProductsService = {

  /**
   * Listing catalogue. La visibilité ET les prix renvoyés dépendent du
   * contexte appelant (invité = catalogue public au tier détail ;
   * organisé = règles org_type, voir shared/org-rules.ts).
   */
  async findAll(query: ProductQuery & { mine?: boolean; orgId?: string }, viewer: ViewerCtx) {
    const qb = repo()
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('p.brand', 'br')
      .leftJoinAndSelect('p.images', 'img', 'img.isPrimary = true')
      .leftJoinAndSelect('p.org', 'sellerOrg');

    // R1 — vue « mes produits » : org filtrée et statut actif/inactif visible
    if (query.mine && viewer.orgId) {
      qb.where('p.orgId = :orgId', { orgId: viewer.orgId });
      // Variantes incluses uniquement côté vendeur : les modales Devis /
      // Bons de commande listent les variantes commandables depuis « mes
      // produits » (le catalogue public n'en a pas besoin → réponse plus légère).
      qb.leftJoinAndSelect('p.variants', 'var');
    } else {
      qb.where('p.isActive = true');
      // Règles org_type : filtre de visibilité selon l'appelant
      // (super_admin : pas de filtre, voit tout pour la modération)
      const vis = visibilityCondition(viewer);
      if (vis) qb.andWhere(vis.clause, vis.params);
    }

    if (query.search) {
      qb.andWhere(
        '(p.name ILIKE :s OR p.sku ILIKE :s OR p.oemReference ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.categoryId) qb.andWhere('p.categoryId = :cat', { cat: query.categoryId });
    if (query.brandId)    qb.andWhere('p.brandId = :br',    { br:  query.brandId });
    if (query.condition)  qb.andWhere('p.condition = :c',   { c:   query.condition });
    if (query.minPrice)   qb.andWhere('p.basePrice >= :min',{ min: query.minPrice });
    if (query.maxPrice)   qb.andWhere('p.basePrice <= :max',{ max: query.maxPrice });

    // Filtre compatibilité véhicule
    if (query.make || query.model || query.year) {
      qb.innerJoin(
        'p.compatibilities', 'comp',
        [
          query.make  ? 'comp.make ILIKE :make'   : null,
          query.model ? 'comp.model ILIKE :model'  : null,
          query.year  ? ':year BETWEEN comp.yearFrom AND COALESCE(comp.yearTo, 9999)' : null,
        ].filter(Boolean).join(' AND '),
        {
          ...(query.make  && { make:  `%${query.make}%` }),
          ...(query.model && { model: `%${query.model}%` }),
          ...(query.year &&  { year:  query.year }),
        },
      );
    }

    // Filtre en stock
    if (query.inStock) {
      qb.innerJoin(
        'p.variants', 'v',
      ).innerJoin(
        StockLevel, 'sl', 'sl.variantId = v.id AND sl.qty_on_hand - sl.qty_reserved > 0',
      );
    }

    // Whitelist défensive (Zod valide déjà, mais défense en profondeur)
    const safeSortBy  = safeOrderBy(query.sortBy, SORT_COLS.products, 'createdAt');
    const safeSortDir = query.sortDir === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`p.${safeSortBy}`, safeSortDir);
    const result = await paginate(qb, query.page, query.limit);

    // Grille de prix filtrée par tier autorisé de l'appelant (backend,
    // pas juste masqué au frontend) + infos MOQ
    const tiers = await loadTiers();
    decorateProducts(result.data, viewer, tiers);
    return result;
  },

  async findById(id: string) {
    return cached(CacheKeys.product(id), async () => {
      const p = await repo().findOne({
        where: { id, isActive: true },
        relations: ['category', 'brand', 'images', 'variants', 'compatibilities', 'org'],
      });
      if (!p) throw ApiError.notFound('Produit');
      return p;
    }, 300);
  },

  /** Fiche produit pour un appelant : visibilité + grille de prix autorisée. */
  async findByIdForViewer(id: string, viewer: ViewerCtx) {
    const p = await this.findById(id);
    // Un produit hors périmètre de l'appelant (ex. produit importer pour
    // un garage) est traité comme introuvable — jamais de fuite de prix.
    if (!isProductVisible(p, viewer)) throw ApiError.notFound('Produit');
    const tiers = await loadTiers();
    return decorateProducts([p], viewer, tiers)[0];
  },

  /**
   * Règles org_type — l'organisation appelante doit pouvoir vendre
   * (importer/wholesaler, ou can_sell=true activé par un admin).
   */
  async requireSellingOrg(orgId?: string | null): Promise<Organization | null> {
    if (!orgId) return null; // produit plateforme (super_admin uniquement)
    const org = await AppDataSource.getRepository(Organization).findOneBy({ id: orgId });
    if (!org) throw ApiError.notFound('Organisation');
    if (!canSellAs(org.orgType, org.canSell)) {
      throw ApiError.forbidden(
        `Votre type d'organisation (${org.orgType}) ne permet pas de lister des produits à la vente`,
      );
    }
    return org;
  },

  async create(dto: CreateProductDto, caller: { orgId?: string | null; isSuperAdmin: boolean }) {
    const exists = await repo().findOneBy({ sku: dto.sku });
    if (exists) throw ApiError.conflict(`SKU ${dto.sku} déjà utilisé`);

    // R1 — l'organisation du créateur (seller/org_admin) est attachée
    // automatiquement ; seul le super_admin peut créer sans org (plateforme).
    const org = caller.isSuperAdmin && !caller.orgId ? null : await this.requireSellingOrg(caller.orgId);
    if (!org && !caller.isSuperAdmin) throw ApiError.forbidden('Organisation requise');

    const product = repo().create({ ...dto, orgId: org?.id ?? null });
    // MOQ par défaut selon org_type du vendeur (50 importer / 5 wholesaler / 1 autre)
    if (product.minOrderQty == null) {
      product.minOrderQty = org ? DEFAULT_MOQ_BY_ORG_TYPE[org.orgType as OrgType] : null;
    }
    if (!org) product.publicListing = false; // produit plateforme : jamais public par défaut
    const saved   = await repo().save(product);
    await invalidate(CacheKeys.productList('*'));
    return saved;
  },

  async update(id: string, dto: Partial<CreateProductDto>, caller: { orgId?: string | null; isSuperAdmin: boolean }) {
    const product = await this.findById(id);
    const callerOrgId = caller.isSuperAdmin ? undefined : caller.orgId ?? undefined;
    // R1 — ownership : l'org appelante doit être propriétaire du produit
    if (callerOrgId) {
      // Règles org_type : une org sans capacité de vente ne gère plus ses produits
      await this.requireSellingOrg(callerOrgId);
      const viaOrg   = product.orgId === callerOrgId;
      const viaStock = await AppDataSource.getRepository(StockLevel)
        .createQueryBuilder('sl')
        .innerJoin('sl.warehouse', 'wh')
        .innerJoin('sl.variant', 'v')
        .where('v.product_id = :pid AND wh.org_id = :orgId', { pid: id, orgId: callerOrgId })
        .getExists();
      if (!viaOrg && !viaStock) {
        throw ApiError.forbidden('Vous ne gérez pas ce produit');
      }
    }
    // cat-9 : enregistrer l'historique des prix si basePrice change
    if (dto.basePrice !== undefined && dto.basePrice !== Number(product.basePrice)) {
      try {
        await AppDataSource.getRepository(PriceHistory).save({
          product:  { id },
          changedBy: callerOrgId ? undefined : undefined,
          oldPrice: Number(product.basePrice),
          newPrice: dto.basePrice,
          currency: product.currency,
          reason:   'Mise à jour manuelle',
        });
      } catch { /* non bloquant */ }
    }
    Object.assign(product, dto);
    const saved = await repo().save(product);
    await invalidate(CacheKeys.product(id), CacheKeys.productList('*'));
    return saved;
  },

  async delete(id: string, callerOrgId?: string) {
    if (callerOrgId) {
      const product = await this.findById(id);
      const viaOrg   = product.orgId === callerOrgId;
      const viaStock = await AppDataSource.getRepository(StockLevel)
        .createQueryBuilder('sl')
        .innerJoin('sl.warehouse', 'wh')
        .innerJoin('sl.variant', 'v')
        .where('v.product_id = :pid AND wh.org_id = :orgId', { pid: id, orgId: callerOrgId })
        .getExists();
      if (!viaOrg && !viaStock) throw ApiError.forbidden('Vous ne gérez pas ce produit');
    }
    // Désactivation soft (jamais de suppression physique : commandes liées)
    await repo().update(id, { isActive: false });
    await invalidate(CacheKeys.product(id), CacheKeys.productList('*'));
  },

  async addVariant(productId: string, dto: z.infer<typeof CreateVariantSchema>) {
    const product = await this.findById(productId);
    const exists  = await varRepo().findOneBy({ variantSku: dto.variantSku });
    if (exists) throw ApiError.conflict(`SKU variante ${dto.variantSku} déjà utilisé`);

    const variant = varRepo().create({ ...dto, product });
    const saved = await varRepo().save(variant);
    // Sans invalidation, GET /products/:id renvoyait le détail CACHÉ d'avant
    // la variante → elle n'apparaissait ni chez le vendeur ni sur la fiche.
    await invalidate(CacheKeys.product(productId), CacheKeys.productList('*'));
    return saved;
  },

  async addCompatibility(productId: string, dto: z.infer<typeof CreateCompatibilitySchema>) {
    const product = await this.findById(productId);
    const comp    = compRepo().create({ ...dto, product });
    const saved = await compRepo().save(comp);
    await invalidate(CacheKeys.product(productId));
    return saved;
  },

  async getCompatibilities(productId: string) {
    return compRepo().findBy({ product: { id: productId } });
  },

  async bulkImport(rows: CreateProductDto[], caller: { orgId?: string | null; isSuperAdmin: boolean }) {
    // Règles org_type : même droits et même MOQ par défaut que la création
    // manuelle (un importer importe par palette de 50, un wholesaler par carton de 5)
    const org = caller.isSuperAdmin && !caller.orgId ? null : await this.requireSellingOrg(caller.orgId);
    if (!org && !caller.isSuperAdmin) throw ApiError.forbidden('Organisation requise');
    const defaultMoq = org ? DEFAULT_MOQ_BY_ORG_TYPE[org.orgType as OrgType] : null;

    // Import par batch de 50 pour ne pas surcharger
    const results = { created: 0, skipped: 0, errors: [] as string[] };
    const batches = [];
    for (let i = 0; i < rows.length; i += 50) batches.push(rows.slice(i, i + 50));

    for (const batch of batches) {
      await AppDataSource.transaction(async manager => {
        for (const row of batch) {
          try {
            const exists = await manager.findOneBy(Product, { sku: row.sku });
            if (exists) { results.skipped++; continue; }
            const product = manager.create(Product, { ...row, orgId: org?.id ?? null });
            if (product.minOrderQty == null) product.minOrderQty = defaultMoq;
            if (!org) product.publicListing = false;
            await manager.save(Product, product);
            results.created++;
          } catch (e: any) {
            results.errors.push(`SKU ${row.sku}: ${e.message}`);
          }
        }
      });
    }
    await invalidate('products:*');
    return results;
  },

  /**
   * E5 — Import CSV ligne par ligne avec rapport d'erreurs détaillé.
   * Colonnes attendues (voir GET /products/import/template) :
   * sku,oemReference,name,description,categoryId,brandId,basePrice,currency,weightKg,condition
   * Règles org_type : l'org appelante doit pouvoir vendre ; MOQ par défaut
   * identique à la création manuelle (par org_type du vendeur).
   */
  async importCsv(csvContent: string, caller: { orgId?: string | null; isSuperAdmin: boolean }) {
    const org = caller.isSuperAdmin && !caller.orgId ? null : await this.requireSellingOrg(caller.orgId);
    if (!org && !caller.isSuperAdmin) throw ApiError.forbidden('Organisation requise');
    const defaultMoq = org ? DEFAULT_MOQ_BY_ORG_TYPE[org.orgType as OrgType] : null;

    const parsed = Papa.parse<Record<string, string>>(csvContent.trim(), {
      header:        true,
      skipEmptyLines: 'greedy',
      transformHeader: h => h.trim(),
    });

    const CsvRowSchema = CreateProductSchema.omit({ publicListing: true }).extend({
      basePrice:   z.coerce.number().positive(),
      weightKg:    z.coerce.number().positive().optional(),
      minOrderQty: z.coerce.number().int().min(1).max(1_000_000).optional(),
    });

    const report = {
      total:    parsed.data.length,
      created:  0,
      updated:  0,
      errors:   [] as Array<{ line: number; message: string }>,
    };

    // Validation ligne par ligne AVANT tout écriture en base
    const valid: Array<{ line: number; row: CreateProductDto }> = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const check = CsvRowSchema.safeParse(parsed.data[i]);
      if (!check.success) {
        report.errors.push({
          line:   i + 2, // +2 : header + index 0
          message: check.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(' ; '),
        });
      } else {
        valid.push({ line: i + 2, row: check.data });
      }
    }

    // Batchs de 50 en transaction ; upsert par SKU (créé ou mis à jour)
    const batches: Array<typeof valid> = [];
    for (let i = 0; i < valid.length; i += 50) batches.push(valid.slice(i, i + 50));

    for (const batch of batches) {
      await AppDataSource.transaction(async manager => {
        for (const { line, row } of batch) {
          try {
            const existing = await manager.findOneBy(Product, { sku: row.sku });
            if (existing) {
              await manager.update(Product, existing.id, row);
              report.updated++;
            } else {
              const product = manager.create(Product, { ...row, orgId: org?.id ?? null });
              if (product.minOrderQty == null) product.minOrderQty = defaultMoq;
              await manager.save(Product, product);
              report.created++;
            }
          } catch (e: any) {
            report.errors.push({ line, message: e.message });
          }
        }
      });
    }
    await invalidate('products:*');
    return report;
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const callerOf = (req: Request) => ({
  orgId: req.user!.orgId ?? undefined,
  isSuperAdmin: req.user!.roles.includes('super_admin'),
});

const Ctrl = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const viewer = await loadViewerCtx(req.user);
      // NB : validate() remplace req.query par le résultat Zod parsé — `mine`
      // est déjà un booléen, pas la chaîne 'true'.
      const result = await ProductsService.findAll({ ...(req.query as any), mine: Boolean(req.query.mine) }, viewer);
      res.json(ApiResponse.paginated(result));
    } catch (e) { next(e); }
  },

  getOne: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const viewer = await loadViewerCtx(req.user);
      const p = await ProductsService.findByIdForViewer(req.params.id, viewer);
      res.json(ApiResponse.success(p));
    } catch (e) { next(e); }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = await ProductsService.create(req.body, callerOf(req));
      res.status(201).json(ApiResponse.created(p));
    } catch (e) { next(e); }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = await ProductsService.update(req.params.id, req.body, callerOf(req));
      res.json(ApiResponse.success(p, 'Produit mis à jour'));
    } catch (e) { next(e); }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId, isSuperAdmin } = callerOf(req);
      await ProductsService.delete(req.params.id, isSuperAdmin ? undefined : orgId);
      res.json(ApiResponse.noContent());
    } catch (e) { next(e); }
  },

  addVariant: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const v = await ProductsService.addVariant(req.params.id, req.body);
      res.status(201).json(ApiResponse.created(v));
    } catch (e) { next(e); }
  },

  addCompatibility: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const c = await ProductsService.addCompatibility(req.params.id, req.body);
      res.status(201).json(ApiResponse.created(c));
    } catch (e) { next(e); }
  },

  bulkImport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ProductsService.bulkImport(req.body.products, callerOf(req));
      res.json(ApiResponse.success(result, `Import terminé`));
    } catch (e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const productsRouter = Router();

productsRouter.get('/',    optionalAuthenticate, validate(ProductQuerySchema, 'query'), Ctrl.list);

// E5 — template CSV d'import (doit être déclaré AVANT /:id)
productsRouter.get('/import/template', (_req: Request, res: Response) => {
  const csv = [
    'sku,oemReference,name,description,categoryId,brandId,basePrice,currency,weightKg,condition,minOrderQty',
    'PLQ-BRK-001,OEM-44421,Plaquettes frein avant Toyota Hilux,"Plaquettes céramiques, jeux de 4",<uuid-cat>,<uuid-marque>,45000,XAF,2.5,new,50',
    'DIS-BRK-002,OEM-44555,Disque de frein ventilé 280mm,,<uuid-cat>,<uuid-marque>,78000,XAF,6.2,new,50',
    '(vide = MOQ par défaut selon votre type d\'organisation : importateur 50, grossiste 5)',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="autoparts-import-template.csv"');
  res.send(csv);
});

// optionalAuthenticate : la visibilité et les prix de la fiche dépendent
// du contexte appelant (invité = catalogue public au tier détail)
productsRouter.get('/:id', optionalAuthenticate, Ctrl.getOne);

// Routes protégées
productsRouter.use(authenticate);

// E5 — import CSV de catalogue avec rapport ligne par ligne
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Fichier CSV attendu'));
    }
  },
});
productsRouter.post('/import',
  authorize('seller', 'org_admin', 'super_admin'),
  csvUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next(ApiError.badRequest('Aucun fichier envoyé'));
      const report = await ProductsService.importCsv(req.file.buffer.toString('utf-8'), callerOf(req));
      res.json(ApiResponse.success(report, `${report.created} créé(s), ${report.updated} mis à jour, ${report.errors.length} erreur(s)`));
    } catch (e) { next(e); }
  },
);

productsRouter.post('/',
  authorize('seller', 'org_admin', 'super_admin'),
  validate(CreateProductSchema),
  Ctrl.create,
);
productsRouter.patch('/:id',
  authorize('seller', 'org_admin', 'super_admin'),
  validate(UpdateProductSchema),
  Ctrl.update,
);
productsRouter.delete('/:id',
  authorize('seller', 'org_admin', 'super_admin'),
  Ctrl.delete,
);
productsRouter.post('/:id/variants',
  authorize('seller', 'org_admin', 'super_admin'),
  validate(CreateVariantSchema),
  Ctrl.addVariant,
);
productsRouter.post('/:id/compatibilities',
  authorize('org_admin', 'super_admin'),
  validate(CreateCompatibilitySchema),
  Ctrl.addCompatibility,
);
productsRouter.post('/bulk-import',
  authorize('org_admin', 'super_admin'),
  Ctrl.bulkImport,
);
