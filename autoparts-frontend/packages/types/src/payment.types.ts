// ── Paiements, wallet, remboursements ──────────────────────────
import type { ISODate } from './common';

/**
 * Méthodes acceptées par POST /payments (contrat backend réel) :
 * `mobile_money` nécessite `provider: 'mtn' | 'orange'` + téléphone.
 */
export type PaymentMethodApi =
  | 'mobile_money'
  | 'bank_transfer'
  | 'cash'
  | 'credit'
  | 'card';

export type MomoProvider = 'mtn' | 'orange' | 'cinetpay' | 'fapshi';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded';

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethodApi;
  provider?: MomoProvider | null;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayRef: string;
  gatewayResponse?: unknown;
  /** CinetPay : URL de la page de paiement hébergée (redirection client). */
  paymentUrl?: string | null;
  phone?: string | null;
  paidAt?: ISODate | null;
  createdAt?: ISODate;
}

export interface CreatePaymentDto {
  orderId: string;
  method: PaymentMethodApi;
  phone?: string;
  provider?: MomoProvider;
}

export interface PaymentStatusResponse {
  id: string;
  status: PaymentStatus;
  paidAt?: ISODate | null;
}

export type RefundMethod = 'momo' | 'bank_transfer' | 'wallet';

export interface Refund {
  id: string;
  paymentId?: string;
  orderId?: string;
  amount: number;
  method: RefundMethod;
  status?: string;
  reason?: string | null;
  proofUrl?: string | null;
  createdAt?: ISODate;
}

export interface CreateRefundDto {
  amount: number;
  method: RefundMethod;
  reason?: string;
}

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit' | 'refund' | 'adjustment';
  amount: number;
  description?: string;
  orderId?: string | null;
  balanceAfter?: number;
  createdAt?: ISODate;
}

export interface WalletBalance {
  balance: number;
  currency?: string;
}
