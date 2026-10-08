import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { LoyaltyPoints }    from '../../entities/LoyaltyPoints';
import { Order }            from '../../entities/Order';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }         from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const POINTS_PER_XAF  = 0.01; // 1 point pour 100 XAF
const POINTS_VALUE_XAF= 10;   // 1 point = 10 XAF de réduction

const repo = () => AppDataSource.getRepository(LoyaltyPoints);

export const LoyaltyService = {
  async getBalance(userId: string) {
    const result = await repo().createQueryBuilder('lp')
      .select('SUM(lp.points)', 'total')
      .where('lp.user.id = :uid', { uid: userId })
      .andWhere('(lp.expiresAt IS NULL OR lp.expiresAt > :now)', { now: new Date() })
      .getRawOne<{ total: string }>();
    return { balance: parseInt(result?.total ?? '0'), valueXAF: parseInt(result?.total ?? '0') * POINTS_VALUE_XAF };
  },

  async history(userId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('lp')
      .leftJoinAndSelect('lp.order','o')
      .where('lp.user.id = :uid', { uid: userId })
      .orderBy('lp.createdAt','DESC');
    return paginate(qb, page, limit);
  },

  /** Créditer des points après livraison d'une commande */
  async earnFromOrder(orderId: string, userId: string) {
    const order = await AppDataSource.getRepository(Order).findOneBy({ id: orderId });
    if (!order || order.status !== 'delivered') return;
    const existing = await repo().findOneBy({ order: { id: orderId }, type: 'earned' });
    if (existing) return;

    const { balance } = await this.getBalance(userId);
    const earned = Math.floor(order.totalAmount * POINTS_PER_XAF);
    const expires = new Date(); expires.setFullYear(expires.getFullYear() + 1);

    await repo().save(repo().create({
      user: { id: userId }, order: { id: orderId }, type: 'earned',
      points: earned, balanceAfter: balance + earned,
      description: `Commande ${(order as any).orderNumber}`, expiresAt: expires,
    }));
  },

  async redeem(userId: string, points: number) {
    const { balance } = await this.getBalance(userId);
    if (points > balance) throw ApiError.badRequest(`Solde insuffisant (${balance} points disponibles)`);
    if (points < 100)     throw ApiError.badRequest('Minimum 100 points à échanger');

    const discount = points * POINTS_VALUE_XAF;
    await repo().save(repo().create({
      user: { id: userId }, type: 'redeemed',
      points: -points, balanceAfter: balance - points,
      description: `Échange contre ${discount} XAF de réduction`,
    }));
    return { pointsRedeemed: points, discountXAF: discount };
  },

  async addBonus(userId: string, points: number, description: string) {
    const { balance } = await this.getBalance(userId);
    return repo().save(repo().create({
      user: { id: userId }, type: 'bonus',
      points, balanceAfter: balance + points, description,
    }));
  },
};

export const loyaltyRouter = Router();
loyaltyRouter.use(authenticate);
loyaltyRouter.get('/balance',  async (req,res,next) => { try { res.json(ApiResponse.success(await LoyaltyService.getBalance(req.user!.id))); } catch(e){next(e);} });
loyaltyRouter.get('/history',  async (req,res,next) => { try { res.json(ApiResponse.paginated(await LoyaltyService.history(req.user!.id, +req.query.page!||1))); } catch(e){next(e);} });
loyaltyRouter.post('/redeem',  async (req,res,next) => { try { res.json(ApiResponse.success(await LoyaltyService.redeem(req.user!.id, +req.body.points))); } catch(e){next(e);} });
loyaltyRouter.post('/bonus',   authorize('super_admin'), async (req,res,next) => { try { res.json(ApiResponse.created(await LoyaltyService.addBonus(req.body.userId, +req.body.points, req.body.description))); } catch(e){next(e);} });
