import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource }     from '../../config/database';
import { Category }          from '../../entities/Category';
import { Brand }             from '../../entities/Brand';
import { ApiResponse, ApiError }       from '../../shared/utils/response';
import { cached, CacheKeys } from '../../config/redis';

const categoryRepo = () => AppDataSource.getRepository(Category);
const brandRepo    = () => AppDataSource.getRepository(Brand);

export const CatalogController = {
  listCategories: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await cached(CacheKeys.categories(), async () =>
        categoryRepo().find({ where: { isActive: true }, order: { name: 'ASC' } }),
      );
      res.json(ApiResponse.success(data));
    } catch (e) { next(e); }
  },

  getOneCategory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cat = await categoryRepo().findOne({ where: { id: req.params.id } });
      if (!cat) return next(ApiError.notFound('Catégorie'));
      res.json(ApiResponse.success(cat));
    } catch (e) { next(e); }
  },

  listBrands: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await cached(CacheKeys.brands(), async () =>
        brandRepo().find({ where: { isActive: true }, order: { name: 'ASC' } }),
      );
      res.json(ApiResponse.success(data));
    } catch (e) { next(e); }
  },

  getOneBrand: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const brand = await brandRepo().findOne({ where: { id: req.params.id } });
      if (!brand) return next(ApiError.notFound('Marque'));
      res.json(ApiResponse.success(brand));
    } catch (e) { next(e); }
  },
};

export const catalogRouter = Router();

catalogRouter.get('/categories', CatalogController.listCategories);
catalogRouter.get('/categories/:id', CatalogController.getOneCategory);
catalogRouter.get('/brands', CatalogController.listBrands);
catalogRouter.get('/brands/:id', CatalogController.getOneBrand);