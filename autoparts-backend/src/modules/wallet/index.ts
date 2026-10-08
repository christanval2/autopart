import { Router, Request, Response, NextFunction } from 'express';
import { z }                  from 'zod';
import { AppDataSource }      from '../../config/database';
import { Wallet }             from '../../entities/Wallet';
import { WalletTransaction }  from '../../entities/WalletTransaction';
import { WalletWithdrawal }   from '../../entities/WalletWithdrawal';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }           from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreditSchema = z.object({
  userId:      z.string().uuid(),
  amount:      z.number().positive(),
  description: z.string().max(200).trim().optional(),
  reference:   z.string().max(100).optional(),
});

const DebitSchema = z.object({
  amount:      z.number().positive(),
  description: z.string().max(200).trim().optional(),
  orderId:     z.string().uuid().optional(),
});

const WithdrawSchema = z.object({
  amount: z.number().positive().max(2_000_000),
  phone:  z.string().regex(/^\+?[0-9]{8,15}$/),
});

const walletRepo = () => AppDataSource.getRepository(Wallet);
const txRepo     = () => AppDataSource.getRepository(WalletTransaction);

export const WalletService = {
  async getOrCreate(userId: string): Promise<Wallet> {
    let wallet = await walletRepo().findOne({ where: { user: { id: userId } } });
    if (!wallet) {
      wallet = walletRepo().create({ user: { id: userId }, balance: 0, currency: 'XAF', isActive: true });
      wallet = await walletRepo().save(wallet);
    }
    return wallet;
  },

  async getBalance(userId: string) {
    const wallet = await this.getOrCreate(userId);
    return { balance: Number(wallet.balance), currency: wallet.currency };
  },

  async history(userId: string, page = 1, limit = 20) {
    const wallet = await this.getOrCreate(userId);
    const qb = txRepo().createQueryBuilder('t')
      .where('t.wallet.id = :wid', { wid: wallet.id })
      .orderBy('t.createdAt','DESC');
    return paginate(qb, page, limit);
  },

  async credit(userId: string, amount: number, description?: string, reference?: string, orderId?: string) {
    const wallet = await this.getOrCreate(userId);
    const newBalance = Number(wallet.balance) + amount;
    await walletRepo().update(wallet.id, { balance: newBalance });

    return txRepo().save(txRepo().create({
      wallet: { id: wallet.id },
      order:  orderId ? { id: orderId } : undefined,
      type:   'credit', amount,
      balanceAfter: newBalance,
      description, reference,
    }));
  },

  async debit(userId: string, amount: number, description?: string, orderId?: string) {
    const wallet = await this.getOrCreate(userId);
    if (Number(wallet.balance) < amount)
      throw ApiError.badRequest(`Solde insuffisant : ${wallet.balance} XAF disponibles`);
    const newBalance = Number(wallet.balance) - amount;
    await walletRepo().update(wallet.id, { balance: newBalance });

    return txRepo().save(txRepo().create({
      wallet: { id: wallet.id },
      order:  orderId ? { id: orderId } : undefined,
      type:   'debit', amount,
      balanceAfter: newBalance,
      description,
    }));
  },

  async refund(userId: string, amount: number, orderId?: string) {
    const wallet = await this.getOrCreate(userId);
    const newBalance = Number(wallet.balance) + amount;
    await walletRepo().update(wallet.id, { balance: newBalance });

    return txRepo().save(txRepo().create({
      wallet: { id: wallet.id },
      order:  orderId ? { id: orderId } : undefined,
      type:   'refund', amount,
      balanceAfter: newBalance,
      description: `Remboursement ${orderId ? `commande #${orderId}` : ''}`,
    }));
  },
};

export const walletRouter = Router();
walletRouter.use(authenticate);
walletRouter.get('/balance',  async (req,res,next) => { try { res.json(ApiResponse.success(await WalletService.getBalance(req.user!.id))); } catch(e){next(e);} });
walletRouter.get('/history',  async (req,res,next) => { try { res.json(ApiResponse.paginated(await WalletService.history(req.user!.id, +req.query.page!||1))); } catch(e){next(e);} });
walletRouter.post('/debit',   validate(DebitSchema), async (req,res,next) => {
  try { res.json(ApiResponse.success(await WalletService.debit(req.user!.id, req.body.amount, req.body.description, req.body.orderId))); } catch(e){next(e);}
});
walletRouter.post('/credit',  authorize('super_admin','accountant'), validate(CreditSchema), async (req,res,next) => {
  try { res.json(ApiResponse.created(await WalletService.credit(req.body.userId, req.body.amount, req.body.description, req.body.reference))); } catch(e){next(e);}
});

// E4 — demande de retrait vers un numéro Mobile Money.
// Le montant est débité immédiatement (anti double-dépense) ; en cas de rejet
// comptable, il est recrédité (voir payments → decideWithdrawal).
walletRouter.post('/withdraw', validate(WithdrawSchema), async (req, res, next) => {
  try {
    await WalletService.debit(req.user!.id, req.body.amount, `Demande de retrait vers ${req.body.phone}`);
    const w = AppDataSource.getRepository(WalletWithdrawal).create({
      user:   { id: req.user!.id } as any,
      amount: req.body.amount,
      phone:  req.body.phone,
      status: 'pending',
    });
    const saved = await AppDataSource.getRepository(WalletWithdrawal).save(w);
    res.status(201).json(ApiResponse.created(saved, 'Demande de retrait enregistrée — traitement sous 24 h'));
  } catch (e) { next(e); }
});

walletRouter.get('/withdrawals', async (req, res, next) => {
  try {
    const qb = AppDataSource.getRepository(WalletWithdrawal).createQueryBuilder('w')
      .where('w.user.id = :uid', { uid: req.user!.id })
      .orderBy('w.createdAt', 'DESC');
    res.json(ApiResponse.paginated(await paginate(qb, +(req.query.page as any) || 1)));
  } catch (e) { next(e); }
});
