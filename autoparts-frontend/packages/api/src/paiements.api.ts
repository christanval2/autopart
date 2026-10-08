// ── Paiements : MoMo, Orange, virement, cash, crédit, remboursements ──
import { api, unwrap, unwrapWithPagination } from './client';
import type {
  CreatePaymentDto, Payment, PaymentStatusResponse,
  Refund, CreateRefundDto,
} from '@autoparts/types';

export const paymentsApi = {
  /** Crée un paiement. mobile_money exige phone + provider (mtn|orange). */
  async create(dto: CreatePaymentDto): Promise<Payment> {
    return unwrap(api.post('/payments', dto));
  },

  /** Statut temps réel (polling si webhook absent). */
  async status(id: string): Promise<PaymentStatusResponse> {
    return unwrap(api.get(`/payments/${id}/status`));
  },

  /** Confirmation manuelle (comptable/admin) — virements. */
  async confirmManual(id: string): Promise<Payment> {
    return unwrap(api.post(`/payments/${id}/confirm`));
  },

  async list(page = 1, limit = 20, params: Record<string, unknown> = {}) {
    return unwrapWithPagination<Payment>(api.get('/payments', { params: { page, limit, ...params } }));
  },

  // ── Remboursements ──────────────────────────────────────────
  async createRefund(paymentId: string, dto: CreateRefundDto): Promise<Refund> {
    return unwrap(api.post(`/payments/${paymentId}/refund`, dto));
  },
  async refunds(page = 1, limit = 20) {
    return unwrapWithPagination<Refund>(api.get('/payments/refunds', { params: { page, limit } }));
  },
  async completeRefund(refundId: string, proof?: string): Promise<void> {
    await unwrap(api.post(`/payments/refunds/${refundId}/complete`, { proof }));
  },
};
