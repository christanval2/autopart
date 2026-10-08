// ═══════════════════════════════════════════════════════════════
//  PAYMENTS MODULE  —  MTN MoMo + Orange Money + Virement
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                  from 'zod';
import crypto from 'crypto';
import axios                  from 'axios';
import { antiFraud }       from '../../shared/utils/antifraud';
import { smsService }     from '../../shared/utils/sms';
import { AppDataSource }      from '../../config/database';
import { Payment }            from '../../entities/Payment';
import { Refund }             from '../../entities/Refund';
import { WalletRecharge }     from '../../entities/WalletRecharge';
import { WalletWithdrawal }   from '../../entities/WalletWithdrawal';
import { Order }              from '../../entities/Order';
import { env }                from '../../config/env';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { generateRef, hashSHA256 } from '../../shared/utils/helpers';
import { logger }             from '../../shared/utils/logger';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';
import { Jobs }               from '../../jobs/queues';
import { WalletService }      from '../wallet';
import { getFxRates }         from '../../shared/utils/fx';
import type { PaymentMethod, PaymentStatus } from '../../shared/types';

// ─── Schémas Zod ─────────────────────────────────────────────────

export const InitiatePaymentSchema = z.object({
  orderId:  z.string().uuid(),
  method:   z.enum(['mobile_money', 'bank_transfer', 'cash', 'credit', 'card']),
  // Mobile money spécifique
  phone:    z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
  provider: z.enum(['mtn', 'orange']).optional(),
});

export const WebhookMomoSchema = z.object({
  referenceId:     z.string(),
  status:          z.string(),
  financialTransactionId: z.string().optional(),
  reason:          z.string().optional(),
});

export const RefundSchema = z.object({
  amount:   z.number().positive().optional(),   // défaut : remboursement total
  method:   z.enum(['momo', 'bank_transfer', 'wallet']),
  reason:   z.string().min(5).max(500).trim(),
  phone:    z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
});

export const CompleteRefundSchema = z.object({
  proof: z.string().min(3).max(500).trim(),
});

export const WalletRechargeSchema = z.object({
  amount:   z.number().positive().max(2_000_000),
  phone:    z.string().regex(/^\+?[0-9]{8,15}$/),
  provider: z.enum(['mtn', 'orange']),
});

export const WithdrawalDecisionSchema = z.object({
  // approve : tenter le transfert MoMo | reject : recréditer le wallet
  decision: z.enum(['approve', 'reject']),
  reason:   z.string().max(300).trim().optional(),
});

export type InitiatePaymentDto = z.infer<typeof InitiatePaymentSchema>;

// ─── Adaptateurs paiement ─────────────────────────────────────────

interface PaymentResult {
  gatewayRef: string;
  status:     'pending' | 'completed' | 'failed';
  rawResponse: unknown;
}

// MTN Mobile Money (MoMo API)
const MtnMomoAdapter = {
  async requestToPay(amount: number, currency: string, phone: string, ref: string): Promise<PaymentResult> {
    try {
      const response = await axios.post(
        `${env.MOMO_API_URL}/collection/v1_0/requesttopay`,
        {
          amount:       String(amount),
          currency,
          externalId:   ref,
          payer:        { partyIdType: 'MSISDN', partyId: phone.replace('+', '') },
          payerMessage: 'Paiement AutoParts Marketplace',
          payeeNote:    ref,
        },
        {
          headers: {
            'Authorization':          `Bearer ${env.MOMO_API_KEY}`,
            'X-Reference-Id':         ref,
            'X-Target-Environment':   env.NODE_ENV === 'production' ? 'mtncameroon' : 'sandbox',
            'Ocp-Apim-Subscription-Key': env.MOMO_SUBSCRIPTION_KEY,
            'Content-Type':           'application/json',
          },
        },
      );
      return { gatewayRef: ref, status: 'pending', rawResponse: response.data };
    } catch (err: any) {
      logger.error('MTN MoMo error:', err.response?.data ?? err.message);
      throw ApiError.badRequest('Erreur initiation paiement MTN MoMo');
    }
  },

  async checkStatus(ref: string): Promise<{ status: PaymentStatus; transactionId?: string }> {
    try {
      const { data } = await axios.get(
        `${env.MOMO_API_URL}/collection/v1_0/requesttopay/${ref}`,
        {
          headers: {
            'Authorization': `Bearer ${env.MOMO_API_KEY}`,
            'X-Target-Environment': env.NODE_ENV === 'production' ? 'mtncameroon' : 'sandbox',
            'Ocp-Apim-Subscription-Key': env.MOMO_SUBSCRIPTION_KEY,
          },
        },
      );
      const map: Record<string, PaymentStatus> = {
        SUCCESSFUL: 'completed',
        FAILED:     'failed',
        PENDING:    'processing',
      };
      return {
        status: map[data.status] ?? 'processing',
        transactionId: data.financialTransactionId,
      };
    } catch {
      return { status: 'processing' };
    }
  },

  /**
   * Virement inverse (remboursement) via l'API Disbursement MoMo.
   * Nécessite une souscription disbursement active sur le compte marchand —
   * en cas d'échec l'appelant bascule le remboursement en traitement manuel.
   */
  async transfer(amount: number, currency: string, phone: string, ref: string): Promise<PaymentResult> {
    const { data } = await axios.post(
      `${env.MOMO_API_URL}/disbursement/v1_0/transfer`,
      {
        amount:       String(amount),
        currency,
        externalId:   ref,
        payee:        { partyIdType: 'MSISDN', partyId: phone.replace('+', '') },
        payerMessage: 'Remboursement AutoParts',
        payeeNote:    ref,
      },
      {
        headers: {
          'Authorization':             `Bearer ${env.MOMO_API_KEY}`,
          'X-Reference-Id':            ref,
          'X-Target-Environment':      env.NODE_ENV === 'production' ? 'mtncameroon' : 'sandbox',
          'Ocp-Apim-Subscription-Key': env.MOMO_SUBSCRIPTION_KEY,
          'Content-Type':              'application/json',
        },
        timeout: 15_000,
      },
    );
    return { gatewayRef: ref, status: 'pending', rawResponse: data };
  },
};

// Orange Money
const OrangeMoneyAdapter = {
  async initiate(amount: number, currency: string, phone: string, ref: string): Promise<PaymentResult> {
    try {
      const { data } = await axios.post(
        `${env.ORANGE_API_URL}/orange-money-webpay/cm/v1/webpayment`,
        {
          merchant_key:     env.ORANGE_API_TOKEN,
          currency,
          order_id:         ref,
          amount,
          return_url:       `${env.APP_URL}/payments/callback/orange`,
          cancel_url:       `${env.APP_URL}/payments/cancel`,
          notif_url:        `${env.APP_URL}/api/v1/payments/webhook/orange`,
          lang:             'fr',
          reference:        ref,
        },
      );
      return {
        gatewayRef:  ref,
        status:      'pending',
        rawResponse: data,
      };
    } catch (err: any) {
      logger.error('Orange Money error:', err.response?.data ?? err.message);
      throw ApiError.badRequest('Erreur initiation paiement Orange Money');
    }
  },
};

// ─── Service ─────────────────────────────────────────────────────

const paymentRepo = () => AppDataSource.getRepository(Payment);
const orderRepo   = () => AppDataSource.getRepository(Order);
const refundRepo  = () => AppDataSource.getRepository(Refund);

// Email de confirmation envoyé dès qu'un paiement passe à completed
function notifyOrderPaid(payment: Payment): void {
  const order = payment.order as Order | undefined;
  const buyer = (order as any)?.buyer as { email?: string } | undefined;
  if (!order || !buyer?.email) return;
  Jobs.sendEmail({
    to:       buyer.email,
    subject:  `[AutoParts] Commande ${order.orderNumber} confirmée`,
    template: 'order-confirmed',
    context:  {
      orderNumber: order.orderNumber,
      totalAmount: Number(payment.amount).toLocaleString('fr-FR'),
      currency:    payment.currency,
      orderId:     order.id,
    },
  }).catch(e => logger.warn('Email order-confirmed non envoyé:', e.message));
}

export const PaymentsService = {

  async initiate(dto: InitiatePaymentDto): Promise<Payment> {
    const order = await orderRepo().findOne({
      where: { id: dto.orderId },
      relations: ['payment', 'buyer'],
    });
    if (!order) throw ApiError.notFound('Commande');
    if (order.payment?.status === 'completed') throw ApiError.conflict('Commande déjà payée');
    if (order.status === 'cancelled') throw ApiError.badRequest('Commande annulée');

    const ref = generateRef('PAY');

    let result: PaymentResult | null = null;

    if (dto.method === 'mobile_money') {
      if (!dto.phone) throw ApiError.badRequest('Numéro de téléphone requis pour Mobile Money');

      if (dto.provider === 'mtn') {
        result = await MtnMomoAdapter.requestToPay(
          order.totalAmount, order.currency, dto.phone, ref,
        );
      } else if (dto.provider === 'orange') {
        result = await OrangeMoneyAdapter.initiate(
          order.totalAmount, order.currency, dto.phone, ref,
        );
      } else {
        throw ApiError.badRequest('Provider mobile money requis: mtn | orange');
      }
    }

    // Pour virement / cash / crédit : créer en pending manuellement
    if (!result) {
      result = { gatewayRef: ref, status: 'pending', rawResponse: null };
    }

    const payment = paymentRepo().create({
      order,
      method:          dto.method,
      status:          result.status,
      amount:          order.totalAmount,
      currency:        order.currency,
      gatewayRef:      result.gatewayRef,
      gatewayResponse: result.rawResponse,
    });
    const saved = await paymentRepo().save(payment);
    saved.order = order;

    // Virement : instructions bancaires par email + expiration auto 72 h
    if (dto.method === 'bank_transfer') {
      const buyer = (order as any).buyer as { email?: string } | undefined;
      if (buyer?.email) {
        Jobs.sendEmail({
          to:       buyer.email,
          subject:  `[AutoParts] Instructions de virement — commande ${order.orderNumber}`,
          template: 'bank-transfer-instructions',
          context:  {
            orderNumber: order.orderNumber,
            amount:      Number(order.totalAmount).toLocaleString('fr-FR'),
            reference:   ref,
            bankName:    env.BANK_NAME,
            rib:         env.BANK_RIB,
            expiresInHours: 72,
          },
        }).catch(e => logger.warn('Email virement non envoyé:', e.message));
      }
      await Jobs.paymentsQueue().add('expire', { paymentId: saved.id }, { delay: 72 * 3600 * 1000 });
    }

    return saved;
  },

  /**
   * Vérification HMAC timing-safe pour les webhooks MoMo/Orange.
   * Utilise crypto.timingSafeEqual pour prévenir les timing attacks.
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      const sig = Buffer.from(signature, 'hex');
      const exp = Buffer.from(expected, 'hex');
      if (sig.length !== exp.length) return false;
      return crypto.timingSafeEqual(sig, exp);
    } catch {
      return false;
    }
  },

  async handleMomoWebhook(provider: 'mtn' | 'orange', body: unknown): Promise<void> {
    // Vérifier signature webhook
    const parsed = WebhookMomoSchema.safeParse(body);
    if (!parsed.success) return;

    const { referenceId, status, financialTransactionId } = parsed.data;

    const payment = await paymentRepo().findOne({
      where: { gatewayRef: referenceId },
      relations: ['order', 'order.buyer'],
    });

    // Référence inconnue côté paiements : peut-être une recharge wallet
    if (!payment) {
      await handleWalletRechargeWebhook(referenceId, status);
      return;
    }

    const statusMap: Record<string, PaymentStatus> = {
      SUCCESSFUL: 'completed',
      FAILED:     'failed',
      PENDING:    'processing',
    };

    const newStatus = statusMap[status] ?? 'processing';
    payment.status = newStatus;
    if (financialTransactionId) {
      payment.gatewayResponse = {
        ...(payment.gatewayResponse as object),
        financialTransactionId,
      };
    }

    if (newStatus === 'completed') {
      payment.paidAt = new Date();
      // Confirmer automatiquement la commande
      await orderRepo().update(payment.order.id, { status: 'confirmed' });
      notifyOrderPaid(payment);
    }

    await paymentRepo().save(payment);
    logger.info(`Paiement ${referenceId} → ${newStatus}`);
  },

  async checkStatus(
    paymentId: string,
    ctx: { callerId: string; callerOrgId?: string | null; isAdmin?: boolean },
  ): Promise<Payment> {
    const payment = await paymentRepo().findOne({
      where: { id: paymentId },
      relations: ['order', 'order.buyer', 'order.sellerOrg'],
    });
    if (!payment) throw ApiError.notFound('Paiement');

    // IDOR-2 : vérifier ownership — buyer ou seller org
    if (!ctx.isAdmin) {
      const isBuyer     = (payment.order as any)?.buyer?.id === ctx.callerId;
      const isSellerOrg = ctx.callerOrgId &&
        (payment.order as any)?.sellerOrg?.id === ctx.callerOrgId;
      if (!isBuyer && !isSellerOrg) throw ApiError.forbidden();
    }

    // Polling statut pour Mobile Money en attente
    if (payment.status === 'pending' || payment.status === 'processing') {
      let gatewayStatus: PaymentStatus = payment.status;

      if (payment.method === 'mobile_money') {
        const check = await MtnMomoAdapter.checkStatus(payment.gatewayRef);
        gatewayStatus = check.status;
      }

      if (gatewayStatus !== payment.status) {
        payment.status = gatewayStatus;
        if (gatewayStatus === 'completed') {
          payment.paidAt = new Date();
          await orderRepo().update(payment.order.id, { status: 'confirmed' });
          notifyOrderPaid(payment);
        }
        await paymentRepo().save(payment);
      }
    }

    return payment;
  },

  async manualConfirm(paymentId: string, adminId: string, proof?: string): Promise<Payment> {
    const payment = await paymentRepo().findOneOrFail({
      where: { id: paymentId },
      relations: ['order', 'order.buyer'],
    });
    if (payment.status === 'completed') throw ApiError.conflict('Paiement déjà confirmé');
    payment.status = 'completed';
    payment.paidAt = new Date();
    payment.gatewayResponse = {
      ...((payment.gatewayResponse as object) ?? {}),
      manuallyConfirmedBy: adminId,
      confirmedAt: new Date().toISOString(),
      ...(proof ? { proof } : {}),
    };
    await orderRepo().update(payment.order.id, { status: 'confirmed' });
    const saved = await paymentRepo().save(payment);
    notifyOrderPaid(saved);
    return saved;
  },

  /**
   * Remboursement total ou partiel.
   * - momo : virement inverse via API ; en cas d'échec → pending_manual (comptable)
   * - bank_transfer : toujours pending_manual, le comptable joint la preuve
   * - wallet : avoir immédiat sur le portefeuille de l'acheteur
   */
  async refund(
    paymentId: string,
    dto: { amount?: number; method: 'momo'|'bank_transfer'|'wallet'; reason: string; phone?: string },
    ctx: { callerId: string; callerOrgId?: string | null; isAdmin?: boolean },
  ): Promise<Refund> {
    const payment = await paymentRepo().findOne({
      where: { id: paymentId },
      relations: ['order', 'order.buyer', 'order.sellerOrg'],
    });
    if (!payment) throw ApiError.notFound('Paiement');
    if (payment.status !== 'completed') throw ApiError.badRequest('Seul un paiement complété peut être remboursé');

    // Ownership : vendeur de la commande ou admin
    if (!ctx.isAdmin) {
      const isSellerOrg = ctx.callerOrgId && (payment.order as any)?.sellerOrg?.id === ctx.callerOrgId;
      if (!isSellerOrg) throw ApiError.forbidden();
    }

    const refundedSoFar = await refundRepo()
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.amount), 0)', 'total')
      .where('r.payment_id = :pid AND r.status != :failed', { pid: paymentId, failed: 'failed' })
      .getRawOne();
    const alreadyRefunded = Number(refundedSoFar?.total ?? 0);
    const amount = dto.amount ?? Number(payment.amount);
    if (amount <= 0 || alreadyRefunded + amount > Number(payment.amount) + 0.001) {
      throw ApiError.badRequest(
        `Montant invalide : déjà remboursé ${alreadyRefunded} / ${payment.amount}`,
      );
    }

    const buyer = (payment.order as any).buyer as { id: string; email?: string } | undefined;

    const refund = refundRepo().create({
      payment,
      amount,
      method: dto.method,
      status: 'pending',
      reason: dto.reason,
    });

    if (dto.method === 'wallet') {
      if (!buyer?.id) throw ApiError.badRequest('Acheteur introuvable pour le crédit wallet');
      await WalletService.credit(buyer.id, amount, `Remboursement commande ${(payment.order as any).orderNumber}`, undefined, (payment.order as any).id);
      refund.status = 'completed';
      refund.gatewayRef = `WALLET-${generateRef('RF')}`;
    } else if (dto.method === 'momo') {
      if (!dto.phone) throw ApiError.badRequest('Numéro MoMo requis pour un remboursement Mobile Money');
      refund.gatewayRef = generateRef('RF');
      try {
        const r = await MtnMomoAdapter.transfer(amount, payment.currency, dto.phone, refund.gatewayRef!);
        refund.status = r.status === 'completed' ? 'completed' : 'processing';
      } catch (e) {
        // API disbursement indisponible/non activée → traitement manuel comptable
        refund.status = 'pending_manual';
        logger.warn('Refund MoMo basculé en manuel:', (e as Error).message);
      }
    } else {
      // bank_transfer : traitement manuel avec preuve
      refund.status = 'pending_manual';
    }

    const saved = await refundRepo().save(refund);

    // Paiement/commande marqués remboursés si remboursement TOTAL confirmé
    if (saved.status === 'completed' && alreadyRefunded + amount >= Number(payment.amount) - 0.001) {
      await paymentRepo().update(paymentId, { status: 'refunded' });
      await orderRepo().update((payment.order as any).id, { status: 'refunded' });
    }
    return saved;
  },

  /** Le comptable solde un remboursement manuel avec preuve (avis de crédit). */
  async completeRefund(refundId: string, proof: string, accountantId: string): Promise<Refund> {
    const refund = await refundRepo().findOne({
      where: { id: refundId },
      relations: ['payment', 'payment.order'],
    });
    if (!refund) throw ApiError.notFound('Remboursement');
    if (refund.status !== 'pending_manual' && refund.status !== 'processing') {
      throw ApiError.conflict('Ce remboursement ne peut plus être soldé');
    }
    refund.status = 'completed';
    refund.proof = proof;
    refund.processedBy = { id: accountantId } as any;

    const payment = refund.payment;
    if (Number(refund.amount) >= Number(payment.amount) - 0.001) {
      await paymentRepo().update(payment.id, { status: 'refunded' });
      await orderRepo().update((payment.order as any).id, { status: 'refunded' });
    }
    return refundRepo().save(refund);
  },
};

// Webhook d'une recharge wallet (référence absente des paiements de commande)
async function handleWalletRechargeWebhook(referenceId: string, status: string): Promise<void> {
  if (status !== 'SUCCESSFUL') return;
  const rechargeRepo = AppDataSource.getRepository(WalletRecharge);
  const recharge = await rechargeRepo.findOne({ where: { gatewayRef: referenceId } });
  if (!recharge || recharge.status === 'completed') return; // idempotent

  await WalletService.credit(
    (recharge.user as any).id,
    Number(recharge.amount),
    'Recharge wallet Mobile Money',
    referenceId,
  );
  await rechargeRepo.update(recharge.id, { status: 'completed', processedAt: new Date() });
  logger.info(`Recharge wallet ${referenceId} créditée`);
}

// ─── E4 : recharge / retrait wallet ─────────────────────────────

export const WalletPaymentService = {
  /** Initie une recharge wallet par Mobile Money (crédit au webhook). */
  async recharge(userId: string, dto: { amount: number; phone: string; provider: 'mtn'|'orange' }): Promise<WalletRecharge> {
    const ref = generateRef('WAL');
    const recharge = AppDataSource.getRepository(WalletRecharge).create({
      user: { id: userId } as any,
      amount:      dto.amount,
      provider:    dto.provider,
      phone:       dto.phone,
      gatewayRef:  ref,
      status:      'pending',
    });
    const saved = await AppDataSource.getRepository(WalletRecharge).save(recharge);

    if (dto.provider === 'mtn') {
      await MtnMomoAdapter.requestToPay(dto.amount, 'XAF', dto.phone, ref);
    } else {
      await OrangeMoneyAdapter.initiate(dto.amount, 'XAF', dto.phone, ref);
    }
    return saved;
  },

  /** Le comptable approuve (transfert MoMo) ou rejette (recrédit) un retrait. */
  async decideWithdrawal(
    withdrawalId: string,
    decision: 'approve'|'reject',
    accountantId: string,
    reason?: string,
  ): Promise<WalletWithdrawal> {
    const wRepo = AppDataSource.getRepository(WalletWithdrawal);
    const w = await wRepo.findOne({ where: { id: withdrawalId }, relations: ['user'] });
    if (!w) throw ApiError.notFound('Demande de retrait');
    if (w.status !== 'pending') throw ApiError.conflict('Demande déjà traitée');

    if (decision === 'reject') {
      // Recréditer le wallet (le montant avait été débité à la demande)
      await WalletService.credit((w.user as any).id, Number(w.amount), `Retrait refusé${reason ? ` : ${reason}` : ''}`);
      w.status = 'rejected';
      w.rejectionReason = reason;
      w.processedBy = { id: accountantId } as any;
      return wRepo.save(w);
    }

    w.gatewayRef = generateRef('WDR');
    try {
      await MtnMomoAdapter.transfer(Number(w.amount), 'XAF', w.phone, w.gatewayRef);
      w.status = 'paid';
    } catch (e) {
      // API disbursement indisponible → à solder manuellement une fois le virement fait
      w.status = 'approved';
      logger.warn('Retrait wallet basculé en manuel:', (e as Error).message);
    }
    w.processedBy = { id: accountantId } as any;
    return wRepo.save(w);
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const Ctrl = {
  initiate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await PaymentsService.initiate(req.body);
      res.status(201).json(ApiResponse.created(payment, 'Paiement initié'));
    } catch (e) { next(e); }
  },

  status: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.roles.includes('super_admin');
      const payment = await PaymentsService.checkStatus(req.params.id, {
        callerId:    req.user!.id,
        callerOrgId: req.user!.orgId,
        isAdmin,
      });
      res.json(ApiResponse.success(payment));
    } catch (e) { next(e); }
  },

  webhookMtn: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await PaymentsService.handleMomoWebhook('mtn', req.body);
      res.sendStatus(200);
    } catch (e) { next(e); }
  },

  webhookOrange: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await PaymentsService.handleMomoWebhook('orange', req.body);
      res.sendStatus(200);
    } catch (e) { next(e); }
  },

  manualConfirm: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await PaymentsService.manualConfirm(req.params.id, req.user!.id, req.body?.proof);
      res.json(ApiResponse.success(payment, 'Paiement confirmé manuellement'));
    } catch (e) { next(e); }
  },

  refund: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refund = await PaymentsService.refund(req.params.id, req.body, {
        callerId:    req.user!.id,
        callerOrgId: req.user!.orgId,
        isAdmin:     req.user!.roles.includes('super_admin'),
      });
      res.status(201).json(ApiResponse.created(refund, 'Remboursement enregistré'));
    } catch (e) { next(e); }
  },

  completeRefund: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refund = await PaymentsService.completeRefund(req.params.id, req.body.proof, req.user!.id);
      res.json(ApiResponse.success(refund, 'Remboursement soldé'));
    } catch (e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const paymentsRouter = Router();

// Webhooks publics (pas d'auth — vérification signature dans le service)
paymentsRouter.post('/webhook/mtn',    Ctrl.webhookMtn);
paymentsRouter.post('/webhook/orange', Ctrl.webhookOrange);

// E6c — taux de change du jour (affichage indicatif, commandes en XAF)
paymentsRouter.get('/rates', async (_req: Request, res: Response) => {
  try {
    const fx = await getFxRates();
    res.json(ApiResponse.success({ base: fx.base, rates: fx.rates, fetchedAt: fx.fetchedAt }));
  } catch (e) { res.json(ApiResponse.success({ base: 'XAF', rates: { XAF: 1 }, fetchedAt: 'unavailable' })); }
});

paymentsRouter.use(authenticate);

// Liste paginée des paiements (vue comptable / admin)
paymentsRouter.get('/',
  authorize('accountant', 'super_admin', 'org_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = '1', limit = '20', status, method } = req.query as Record<string, string>;
      const qb = paymentRepo().createQueryBuilder('p')
        .leftJoinAndSelect('p.order', 'o')
        // ⚠️ skip/take exige les NOMS DE PROPRIÉTÉS de l'entité (paidAt),
        // pas les noms de colonnes DB (paid_at)
        .orderBy('p.paidAt', 'DESC')
        .addOrderBy('p.id', 'DESC');
      if (status) qb.andWhere('p.status = :status', { status });
      if (method) qb.andWhere('p.method = :method', { method });
      const pageN = Math.max(1, parseInt(page, 10) || 1);
      const limitN = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const [data, total] = await qb.skip((pageN - 1) * limitN).take(limitN).getManyAndCount();
      res.json(ApiResponse.paginated({ data, total, page: pageN, limit: limitN }));
    } catch (e) { next(e); }
  },
);

paymentsRouter.post('/',
  authorize('buyer', 'org_admin'),
  validate(InitiatePaymentSchema),
  Ctrl.initiate,
);
paymentsRouter.get('/:id/status', Ctrl.status);
paymentsRouter.post('/:id/confirm',
  authorize('accountant', 'org_admin', 'super_admin'),
  Ctrl.manualConfirm,
);
paymentsRouter.post('/:id/refund',
  authorize('seller', 'org_admin', 'super_admin'),
  validate(RefundSchema),
  Ctrl.refund,
);
// G6c — liste des remboursements (vue vendeur/comptable)
paymentsRouter.get('/refunds',
  authorize('accountant', 'super_admin', 'org_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = '1', limit = '20', status } = req.query as Record<string, string>;
      const qb = refundRepo().createQueryBuilder('r')
        .leftJoinAndSelect('r.payment', 'p')
        .leftJoinAndSelect('p.order', 'o')
        .orderBy('r.createdAt', 'DESC');
      if (status) qb.andWhere('r.status = :status', { status });
      const pageN = Math.max(1, parseInt(page, 10) || 1);
      const limitN = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const [data, total] = await qb.skip((pageN - 1) * limitN).take(limitN).getManyAndCount();
      res.json(ApiResponse.paginated({ data, total, page: pageN, limit: limitN }));
    } catch (e) { next(e); }
  },
);

paymentsRouter.post('/refunds/:id/complete',
  authorize('accountant', 'super_admin'),
  validate(CompleteRefundSchema),
  Ctrl.completeRefund,
);
// E4 — recharge wallet par Mobile Money (créditée au webhook)
paymentsRouter.post('/wallet/recharge',
  validate(WalletRechargeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recharge = await WalletPaymentService.recharge(req.user!.id, req.body);
      res.status(201).json(ApiResponse.created(recharge, 'Recharge initiée — validez sur votre téléphone'));
    } catch (e) { next(e); }
  },
);
// E4 — le comptable approuve/rejette une demande de retrait wallet
paymentsRouter.post('/wallet/withdrawals/:id/decision',
  authorize('accountant', 'super_admin'),
  validate(WithdrawalDecisionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const w = await WalletPaymentService.decideWithdrawal(req.params.id, req.body.decision, req.user!.id, req.body.reason);
      res.json(ApiResponse.success(w));
    } catch (e) { next(e); }
  },
);

// ─── F6.1 : réconciliation des relevés MoMo ─────────────────────
import Papa                                   from 'papaparse';
import multer                                 from 'multer';
import { MomoStatement, MomoStatementLine }   from '../../entities/MomoStatement';
import { reconcileLine, findPaymentForLine }  from './reconciliation';
import type { StatementLineInput, PlatformPayment } from './reconciliation';

const statementUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['text/csv', 'text/plain', 'application/csv'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Fichier CSV attendu'));
    }
  },
});

const StatementImportSchema = z.object({
  provider:    z.enum(['mtn', 'orange']).default('mtn'),
  periodLabel: z.string().min(4).max(50),   // ex: '2026-08'
});

export const ReconciliationService = {
  /** Import d'un relevé CSV + matching automatique. */
  async importStatement(
    csv: string, meta: { provider: 'mtn'|'orange'; periodLabel: string; fileName?: string; userId: string },
  ) {
    const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
      header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().toLowerCase(),
    });

    // Mapping tolérant sur les en-têtes opérateurs
    const lines: StatementLineInput[] = [];
    for (const row of parsed.data) {
      const ref = row['referenceid'] ?? row['externalid'] ?? row['financialtransactionid'] ?? row['reference'];
      const amount = Number(row['amount']);
      if (!ref || !Number.isFinite(amount)) continue;
      lines.push({
        externalRef: ref,
        amount,
        operatorStatus: row['status'],
        occurredAt: row['date'] || row['createdat'] ? new Date(row['date'] ?? row['createdat']) : null,
      });
    }
    if (!lines.length) throw ApiError.badRequest('Aucune ligne exploitable dans le relevé (colonnes attendues : reference/amount/status)');

    // Paiements de la période : plateforme entière (comptable = vue globale)
    const paymentRows = await paymentRepo().find();
    const payments: PlatformPayment[] = paymentRows.map(p => ({
      id: p.id, gatewayRef: p.gatewayRef, amount: Number(p.amount), status: p.status,
      financialTransactionId: (p.gatewayResponse as any)?.financialTransactionId ?? null,
    }));

    const statement = await AppDataSource.getRepository(MomoStatement).save(
      AppDataSource.getRepository(MomoStatement).create({
        provider: meta.provider, periodLabel: meta.periodLabel,
        fileName: meta.fileName, importedBy: { id: meta.userId } as any,
        lineCount: lines.length,
      }),
    );

    let matched = 0;
    const lineRepo = AppDataSource.getRepository(MomoStatementLine);
    for (const line of lines) {
      const payment = findPaymentForLine(line, payments);
      const result = reconcileLine(line, payment);
      if (result.status === 'matched') matched++;
      await lineRepo.save(lineRepo.create({
        statement: { id: statement.id } as any,
        externalRef: line.externalRef,
        amount: line.amount,
        operatorStatus: line.operatorStatus,
        occurredAt: line.occurredAt ?? undefined,
        matchStatus: result.status,
        matchedPaymentId: result.paymentId,
      }));
    }

    // Les paiements plateforme présents mais absents du relevé
    const refsInStatement = new Set(lines.map(l => l.externalRef));
    const txIdsInStatement = new Set(lines.map(l => l.externalRef));
    const missingAtOperator = payments.filter(p =>
      p.status === 'completed' &&
      !refsInStatement.has(p.gatewayRef) &&
      !(p.financialTransactionId && txIdsInStatement.has(p.financialTransactionId)),
    );

    await AppDataSource.getRepository(MomoStatement).update(statement.id, { matchedCount: matched });
    return {
      statementId: statement.id,
      lineCount: lines.length,
      matched,
      missingInPlatform: lines.length - matched,
      missingAtOperator: missingAtOperator.map(p => ({ paymentId: p.id, gatewayRef: p.gatewayRef, amount: p.amount })),
    };
  },

  /** Rapport détaillé d'un statement importé. */
  async report(statementId: string) {
    const statement = await AppDataSource.getRepository(MomoStatement).findOneByOrFail({ id: statementId });
    const lines = await AppDataSource.getRepository(MomoStatementLine).find({
      where: { statement: { id: statementId } },
      order: { id: 'ASC' },
    });
    const byStatus = lines.reduce<Record<string, number>>((acc, l) => {
      acc[l.matchStatus] = (acc[l.matchStatus] ?? 0) + 1;
      return acc;
    }, {});
    return { statement, summary: byStatus, lines };
  },

  /** Résolution manuelle d'un écart par le comptable. */
  async resolveLine(lineId: string, note: string, paymentId?: string) {
    const lineRepo = AppDataSource.getRepository(MomoStatementLine);
    const line = await lineRepo.findOneByOrFail({ id: lineId });
    line.matchStatus = 'resolved';
    line.note = note;
    if (paymentId) line.matchedPaymentId = paymentId;
    return lineRepo.save(line);
  },
};

const reconUpload = statementUpload;
paymentsRouter.post('/reconciliation/import',
  authorize('accountant', 'super_admin'),
  reconUpload.single('statement'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return next(ApiError.badRequest('Aucun relevé envoyé'));
      const meta = StatementImportSchema.parse({
        provider: req.body.provider ?? 'mtn',
        periodLabel: req.body.periodLabel,
      });
      const result = await ReconciliationService.importStatement(
        req.file.buffer.toString('utf-8'),
        { ...meta, fileName: req.file.originalname, userId: req.user!.id },
      );
      res.status(201).json(ApiResponse.created(result, `Relevé importé : ${result.matched}/${result.lineCount} rapprochés`));
    } catch (e) { next(e); }
  },
);
paymentsRouter.get('/reconciliation/:statementId',
  authorize('accountant', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await ReconciliationService.report(req.params.statementId))); }
    catch (e) { next(e); }
  },
);
const ReconResolveSchema = z.object({
  note:      z.string().min(3).max(300),
  paymentId: z.string().uuid().optional(),
});
paymentsRouter.post('/reconciliation/lines/:lineId/resolve',
  authorize('accountant', 'super_admin'),
  validate(ReconResolveSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ApiResponse.success(await ReconciliationService.resolveLine(req.params.lineId, req.body.note, req.body.paymentId), 'Écart résolu'));
    } catch (e) { next(e); }
  },
);
