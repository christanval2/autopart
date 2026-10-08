import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { Wishlist }      from '../../entities/Wishlist';
import { Product }       from '../../entities/Product';
import { StockLevel }    from '../../entities/StockLevel';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, validateParams } from '../../middlewares';
import { notifyUser }    from '../push-notifications';
import { logger }        from '../../shared/utils/logger';

const AddSchema = z.object({
  productId: z.string().uuid(),
  note:      z.string().max(200).trim().optional(),
});

const repo = () => AppDataSource.getRepository(Wishlist);

export const WishlistService = {
  async get(userId: string) {
    return repo().find({
      where: { user: { id: userId } },
      relations: ['product','product.images','product.brand'],
      order: { createdAt: 'DESC' },
    });
  },
  async add(userId: string, dto: z.infer<typeof AddSchema>) {
    const exists = await repo().findOne({ where: { user:{id:userId}, product:{id:dto.productId} } });
    if (exists) throw ApiError.conflict('Produit déjà dans la wishlist');

    // F5.4 — snapshot prix/stock à l'ajout (base des alertes quotidiennes)
    const product = await AppDataSource.getRepository(Product).findOneByOrFail({ id: dto.productId });
    const priceAtAdd = product.basePrice; // les overrides de prix sont au niveau variante
    const stockRow = await AppDataSource.getRepository(StockLevel)
      .createQueryBuilder('sl')
      .select('SUM(sl.qty_on_hand - sl.qty_reserved)', 'available')
      .where('sl.variant_id IN (SELECT id FROM product_variants WHERE product_id = :pid)', { pid: dto.productId })
      .getRawOne<{ available: string }>();
    const inStock = parseInt(stockRow?.available ?? '0', 10) > 0;

    return repo().save(repo().create({
      user:{id:userId}, product:{id:dto.productId}, note:dto.note,
      priceAtAdd, wasInStock: inStock,
    }));
  },
  async remove(userId: string, productId: string) {
    const item = await repo().findOne({ where: { user:{id:userId}, product:{id:productId} } });
    if (!item) throw ApiError.notFound('Élément wishlist');
    await repo().remove(item);
  },
  async check(userId: string, productId: string) {
    const item = await repo().findOne({ where: { user:{id:userId}, product:{id:productId} } });
    return { inWishlist: !!item };
  },
};

export const wishlistRouter = Router();
wishlistRouter.use(authenticate);
wishlistRouter.get('/',                          async (req,res,next) => { try { res.json(ApiResponse.success(await WishlistService.get(req.user!.id))); } catch(e){next(e);} });
wishlistRouter.post('/',       validate(AddSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await WishlistService.add(req.user!.id, req.body))); } catch(e){next(e);} });
wishlistRouter.delete('/:productId', async (req,res,next) => { try { await WishlistService.remove(req.user!.id, req.params.productId); res.json(ApiResponse.noContent()); } catch(e){next(e);} });
wishlistRouter.get('/check/:productId', async (req,res,next) => { try { res.json(ApiResponse.success(await WishlistService.check(req.user!.id, req.params.productId))); } catch(e){next(e);} });
