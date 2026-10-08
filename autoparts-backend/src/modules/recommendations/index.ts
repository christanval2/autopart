import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource }  from '../../config/database';
import { OrderLine }      from '../../entities/OrderLine';
import { Product }        from '../../entities/Product';
import { Wishlist }       from '../../entities/Wishlist';
import { SearchHistory }  from '../../entities/SearchHistory';
import { ApiResponse }    from '../../shared/utils/response';
import { authenticate }   from '../../middlewares';

export const RecommendationsService = {
  /** Produits les plus populaires */
   async popular(limit = 8): Promise<Product[]> {
    return AppDataSource.getRepository(OrderLine)
      .createQueryBuilder('ol')
      .innerJoin('ol.variant','v').innerJoin('v.product','p')
      .leftJoinAndSelect('p.images','img').leftJoinAndSelect('p.brand','brand')
      .where('p.isActive = true')
      .select(['p','img','brand']).addSelect('COUNT(ol.id)','score')
      .groupBy('p.id, img.id, brand.id').orderBy('score','DESC').limit(limit).getMany() as any;
  },

  /** Produits similaires (même catégorie ou marque) */
  async similar(productId: string, limit = 8): Promise<Product[]> {
    const product = await AppDataSource.getRepository(Product).findOne({
      where: { id: productId }, relations: ['category','brand'],
    });
    if (!product) return this.popular(limit);
    return AppDataSource.getRepository(Product)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images','img').leftJoinAndSelect('p.brand','brand')
      .where('p.isActive = true AND p.id != :pid', { pid: productId })
      .andWhere('(p.category.id = :catId OR p.brand.id = :brandId)', {
        catId: (product.category as any).id, brandId: (product.brand as any).id,
      })
      .orderBy('RANDOM()').limit(limit).getMany();
  },

  /** Filtrage collaboratif : "les acheteurs de X ont aussi acheté Y" */
  async forUser(userId: string, limit = 8): Promise<Product[]> {
    const bought = await AppDataSource.getRepository(OrderLine)
      .createQueryBuilder('ol').innerJoin('ol.order','o')
      .where('o.buyer.id = :uid', { uid: userId })
      .select('ol.variant.id','variantId').getRawMany<{ variantId: string }>();

    const boughtIds = bought.map(r => r.variantId);
    if (boughtIds.length === 0) return this.popular(limit);

    const cobuyers = await AppDataSource.getRepository(OrderLine)
      .createQueryBuilder('ol').innerJoin('ol.order','o')
      .where('ol.variant.id IN (:...ids)', { ids: boughtIds })
      .andWhere('o.buyer.id != :uid', { uid: userId })
      .select('o.buyer.id','buyerId').distinct(true).limit(50)
      .getRawMany<{ buyerId: string }>();

    const cobuyerIds = cobuyers.map(r => r.buyerId);
    if (cobuyerIds.length === 0) return this.popular(limit);

    const recs = await AppDataSource.getRepository(OrderLine)
      .createQueryBuilder('ol').innerJoin('ol.order','o')
      .innerJoin('ol.variant','v').innerJoin('v.product','p')
      .leftJoinAndSelect('p.images','img').leftJoinAndSelect('p.brand','brand')
      .where('o.buyer.id IN (:...buyers)', { buyers: cobuyerIds })
      .andWhere('v.id NOT IN (:...bought)', { bought: boughtIds })
      .andWhere('p.isActive = true')
      .select(['p','img','brand']).addSelect('COUNT(ol.id)','score')
      .groupBy('p.id, img.id, brand.id').orderBy('score','DESC').limit(limit).getMany() as any;

    if (recs.length >= 4) return recs as Product[];
    const popular = await this.popular(limit - recs.length);
    return [...(recs as Product[]), ...popular.filter(p => !(recs as any[]).find(r => r.id === p.id))];
  },

  /** Recommandations basées sur l'activité (recherches + wishlist) */
  async fromActivity(userId: string, limit = 8): Promise<Product[]> {
    const searches = await AppDataSource.getRepository(SearchHistory)
      .find({ where: { user: { id: userId } }, order: { searchedAt: 'DESC' }, take: 10 });

    if (searches.length === 0) return this.forUser(userId, limit);

    const terms = searches.map(s => s.query).join(' ').slice(0, 200);
    const fromSearch = await AppDataSource.getRepository(Product)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images','img').leftJoinAndSelect('p.brand','brand')
      .where('p.isActive = true')
      .andWhere("to_tsvector('french', p.name) @@ plainto_tsquery('french', :q)", { q: terms })
      .limit(limit).getMany();

    if (fromSearch.length >= 4) return fromSearch;
    const extra = await this.forUser(userId, limit - fromSearch.length);
    return [...fromSearch, ...extra.filter(p => !fromSearch.find(r => r.id === p.id))];
  },
};

export const recommendationsRouter = Router();
recommendationsRouter.get('/popular',        async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await RecommendationsService.popular(+req.query.limit! || 8))); } catch(e){next(e);}
});
recommendationsRouter.get('/similar/:id',    async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await RecommendationsService.similar(req.params.id, +req.query.limit! || 8))); } catch(e){next(e);}
});
recommendationsRouter.get('/for-me',         authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await RecommendationsService.forUser(req.user!.id, +req.query.limit! || 8))); } catch(e){next(e);}
});
recommendationsRouter.get('/from-activity',  authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await RecommendationsService.fromActivity(req.user!.id, +req.query.limit! || 8))); } catch(e){next(e);}
});
