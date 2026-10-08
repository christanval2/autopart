import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { OrderLine }     from '../../entities/OrderLine';
import { Order }         from '../../entities/Order';
import { Product }       from '../../entities/Product';
import { ProductEvent }  from '../../entities/ProductEvent';
import { Review }        from '../../entities/Review';
import { SearchHistory } from '../../entities/SearchHistory';
import { PriceHistory }  from '../../entities/PriceHistory';
import { ApiResponse, ApiError }   from '../../shared/utils/response';
import { authenticate, authorize, optionalAuthenticate, perUserRateLimit } from '../../middlewares';

const DateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate:   z.coerce.date().optional(),
  orgId:     z.string().uuid().optional(),
  limit:     z.coerce.number().int().min(1).max(100).default(10),
});

export const AnalyticsService = {
  async topProducts(orgId?: string, startDate?: Date, endDate?: Date, limit = 10) {
    const qb = AppDataSource.getRepository(OrderLine)
      .createQueryBuilder('ol')
      .innerJoin('ol.order', 'o')
      .innerJoin('ol.variant', 'v')
      .innerJoin('v.product', 'p')
      .select('p.id', 'productId').addSelect('p.name', 'name').addSelect('p.sku', 'sku')
      .addSelect('SUM(ol.quantity)', 'totalQty').addSelect('SUM(ol.lineTotal)', 'totalRevenue')
      .addSelect('COUNT(DISTINCT o.id)', 'orderCount')
      .where('o.status NOT IN (:...excl)', { excl: ['cancelled','refunded'] })
      .groupBy('p.id, p.name, p.sku').orderBy('SUM(ol.lineTotal)', 'DESC').limit(limit);
    if (orgId)     qb.andWhere('o.sellerOrg.id = :orgId', { orgId });
    if (startDate) qb.andWhere('o.orderedAt >= :s', { s: startDate });
    if (endDate)   qb.andWhere('o.orderedAt <= :e', { e: endDate });
    return qb.getRawMany();
  },

  async slowMovers(orgId?: string, limit = 10) {
    const qb = AppDataSource.getRepository(Product)
      .createQueryBuilder('p')
      .leftJoin('p.variants', 'v')
      .leftJoin('v.orderLines', 'ol', '1=1')
      .select('p.id','productId').addSelect('p.name','name').addSelect('p.sku','sku')
      .addSelect('COALESCE(SUM(ol.quantity),0)','totalQty')
      .addSelect('COALESCE(SUM(ol.lineTotal),0)','totalRevenue')
      .where('p.isActive = true')
      .groupBy('p.id, p.name, p.sku').orderBy('totalQty','ASC').limit(limit);
    return qb.getRawMany();
  },

  async revenueByCategory(orgId?: string, startDate?: Date, endDate?: Date) {
    const qb = AppDataSource.getRepository(OrderLine)
      .createQueryBuilder('ol')
      .innerJoin('ol.order','o').innerJoin('ol.variant','v').innerJoin('v.product','p').innerJoin('p.category','c')
      .select('c.id','categoryId').addSelect('c.name','categoryName')
      .addSelect('SUM(ol.lineTotal)','revenue').addSelect('COUNT(DISTINCT o.id)','orders')
      .where('o.status NOT IN (:...excl)',{ excl: ['cancelled','refunded'] })
      .groupBy('c.id, c.name').orderBy('revenue','DESC');
    if (orgId)     qb.andWhere('o.sellerOrg.id = :orgId',{ orgId });
    if (startDate) qb.andWhere('o.orderedAt >= :s',{ s: startDate });
    if (endDate)   qb.andWhere('o.orderedAt <= :e',{ e: endDate });
    return qb.getRawMany();
  },

  async revenueTimeline(orgId?: string, startDate?: Date, endDate?: Date, gran: 'day'|'week'|'month' = 'month') {
    const trunc = gran === 'day' ? "DATE_TRUNC('day', o.ordered_at)"
                : gran === 'week' ? "DATE_TRUNC('week', o.ordered_at)"
                : "DATE_TRUNC('month', o.ordered_at)";
    const params: unknown[] = [];
    let where = "o.status NOT IN ('cancelled','refunded')";
    if (orgId)     { params.push(orgId);     where += ` AND o.seller_org_id = $${params.length}`; }
    if (startDate) { params.push(startDate); where += ` AND o.ordered_at >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   where += ` AND o.ordered_at <= $${params.length}`; }
    return AppDataSource.query(
      `SELECT ${trunc} as period, COUNT(DISTINCT o.id)::int as orders, COALESCE(SUM(o.total_amount),0)::float as revenue FROM orders o WHERE ${where} GROUP BY 1 ORDER BY 1`,
      params,
    );
  },

  async conversionStats() {
    const searches = await AppDataSource.getRepository(SearchHistory).createQueryBuilder('sh')
      .select('COUNT(*)','totalSearches').addSelect('AVG(sh.resultsCount)','avgResults').getRawOne();
    const orders   = await AppDataSource.getRepository(Order).createQueryBuilder('o')
      .select('COUNT(*)','totalOrders').where("o.status NOT IN ('draft','cancelled')").getRawOne();
    const reviews  = await AppDataSource.getRepository(Review).createQueryBuilder('r')
      .select('AVG(r.rating)','avgRating').addSelect('COUNT(*)','totalReviews').getRawOne();
    return { searches, orders, reviews };
  },

  async priceHistory(productId: string) {
    return AppDataSource.getRepository(PriceHistory).find({
      where: { product: { id: productId } }, order: { changedAt: 'DESC' }, take: 50,
    });
  },

  /** E6f — enregistre un événement funnel (view / cart ; purchase via hook commande). */
  async trackEvent(productId: string, type: 'view'|'cart'|'purchase', userId?: string) {
    return AppDataSource.getRepository(ProductEvent).save(
      AppDataSource.getRepository(ProductEvent).create({
        product: { id: productId } as any,
        user:    userId ? ({ id: userId } as any) : undefined,
        type,
      }),
    );
  },

  /** E6f — funnel vues → paniers → commandes par produit + produits sans vente 90 j. */
  async productFunnel(limit = 20) {
    const repo = AppDataSource.getRepository(ProductEvent);
    const counts = async (type: string) => repo.createQueryBuilder('e')
      .select('e.product_id', 'productId')
      .addSelect('COUNT(*)', 'count')
      .where('e.type = :type', { type })
      .groupBy('e.product_id')
      .getRawMany<{ productId: string; count: string }>();

    const [views, carts, purchases] = await Promise.all([
      counts('view'), counts('cart'), counts('purchase'),
    ]);
    const toMap = (rows: typeof views) => new Map(rows.map(r => [r.productId, Number(r.count)]));
    const viewMap = toMap(views), cartMap = toMap(carts), purchaseMap = toMap(purchases);

    const productIds = new Set([...viewMap.keys(), ...cartMap.keys(), ...purchaseMap.keys()]);
    const products = productIds.size
      ? await AppDataSource.getRepository(Product)
          .createQueryBuilder('p')
          .where('p.id IN (:...ids)', { ids: [...productIds] })
          .getMany()
      : [];
    const nameOf = new Map(products.map(p => [p.id, p.name]));

    const funnel = [...productIds].slice(0, limit).map(id => ({
      productId: id,
      name:      nameOf.get(id) ?? id,
      views:     viewMap.get(id) ?? 0,
      carts:     cartMap.get(id) ?? 0,
      purchases: purchaseMap.get(id) ?? 0,
      conversionRate: viewMap.get(id)
        ? Math.round(((purchaseMap.get(id) ?? 0) / (viewMap.get(id) ?? 1)) * 1000) / 10
        : 0,
    })).sort((a, b) => b.views - a.views);

    // Produits actifs sans événement 'purchase' depuis 90 jours
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const recentPurchases = await repo.createQueryBuilder('e')
      .select('DISTINCT e.product_id', 'productId')
      .where("e.type = 'purchase' AND e.created_at >= :cutoff", { cutoff })
      .getRawMany<{ productId: string }>();
    const soldRecently = new Set(recentPurchases.map(r => r.productId));
    const zeroSaleProducts = await AppDataSource.getRepository(Product)
      .createQueryBuilder('p')
      .where('p.isActive = true')
      .getMany();

    return {
      funnel,
      zeroSaleSince90d: zeroSaleProducts
        .filter(p => !soldRecently.has(p.id))
        .slice(0, limit)
        .map(p => ({ productId: p.id, name: p.name, sku: p.sku })),
    };
  },
};

export const analyticsRouter = Router();

// E6f — tracking funnel public (view/cart) : auth optionnelle, rate-limité
const TrackSchema = z.object({
  productId: z.string().uuid(),
  type:      z.enum(['view', 'cart']),
});
analyticsRouter.post('/track',
  optionalAuthenticate,
  perUserRateLimit('track', 60, 60),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = TrackSchema.parse(req.body);
      await AnalyticsService.trackEvent(dto.productId, dto.type, req.user?.id);
      res.status(201).json(ApiResponse.created(null));
    } catch (e) {
      if (e instanceof z.ZodError) return next(ApiError.unprocessable('Payload invalide'));
      next(e);
    }
  },
);

analyticsRouter.use(authenticate, authorize('super_admin','org_admin'));
analyticsRouter.get('/products/funnel',    async (req,res,next) => { try { res.json(ApiResponse.success(await AnalyticsService.productFunnel(+(req.query.limit as any)||20))); } catch(e){next(e);} });
analyticsRouter.get('/products/top',       async (req,res,next) => { try { const { orgId,startDate,endDate,limit } = DateRangeSchema.parse(req.query); res.json(ApiResponse.success(await AnalyticsService.topProducts(orgId,startDate,endDate,limit))); } catch(e){next(e);} });
analyticsRouter.get('/products/slow',      async (req,res,next) => { try { res.json(ApiResponse.success(await AnalyticsService.slowMovers(req.query.orgId as string|undefined,+req.query.limit!||10))); } catch(e){next(e);} });
analyticsRouter.get('/categories',         async (req,res,next) => { try { const { orgId,startDate,endDate } = DateRangeSchema.parse(req.query); res.json(ApiResponse.success(await AnalyticsService.revenueByCategory(orgId,startDate,endDate))); } catch(e){next(e);} });
analyticsRouter.get('/timeline',           async (req,res,next) => { try { const { orgId,startDate,endDate } = DateRangeSchema.parse(req.query); res.json(ApiResponse.success(await AnalyticsService.revenueTimeline(orgId,startDate,endDate,(req.query.granularity as any)||'month'))); } catch(e){next(e);} });
analyticsRouter.get('/conversion',         async (req,res,next) => { try { res.json(ApiResponse.success(await AnalyticsService.conversionStats())); } catch(e){next(e);} });
analyticsRouter.get('/price-history/:id',  async (req,res,next) => { try { res.json(ApiResponse.success(await AnalyticsService.priceHistory(req.params.id))); } catch(e){next(e);} });
