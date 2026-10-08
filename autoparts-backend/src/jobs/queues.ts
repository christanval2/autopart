// ═══════════════════════════════════════════════════════════════
//  QUEUES — producteurs BullMQ (côté API)
//  Instanciation paresseuse : créer une Queue ouvre une connexion
//  Redis, on ne le fait donc qu'au premier ajout de job, jamais au
//  simple import du module (sinon blocage en tests / Redis down).
//  Les workers consommateurs vivent dans src/jobs/index.ts.
// ═══════════════════════════════════════════════════════════════

import { Queue } from 'bullmq';
import { redis } from '../config/redis';

const connection = { connection: redis };

const registry = new Map<string, Queue>();

function getQueue(name: string, defaultJobOptions?: object): Queue {
  let q = registry.get(name);
  if (!q) {
    q = new Queue(name, defaultJobOptions ? { ...connection, defaultJobOptions } : connection);
    registry.set(name, q);
  }
  return q;
}

// ─── Contrats de jobs (partagés avec les workers) ────────────────

export interface EmailJobData {
  to:       string;
  subject:  string;
  template: 'order-confirmed' | 'order-shipped' | 'password-reset' | 'verify-email' | 'low-stock' | 'invoice' | 'bank-transfer-instructions' | 'invitation' | 'custom';
  context:  Record<string, unknown>;
}

export interface StockAlertJobData {
  variantId: string;
  sku:       string;
  available: number;
  threshold: number;
  orgId:     string;
}

export interface InvoiceJobData {
  orderId: string;
}

export interface NotifJobData {
  userId:  string;
  type:    string;
  title:   string;
  body:    string;
  payload?: Record<string, unknown>;
}

export interface PaymentExpiryJobData {
  paymentId: string;
}

export interface ApprovalTimeoutJobData {
  approvalId: string;
}

// ─── Accès lazy aux queues ───────────────────────────────────────

export const queues = {
  email:    () => getQueue('email',    { defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } }),
  stock:    () => getQueue('stock'),
  invoice:  () => getQueue('invoice'),
  notif:    () => getQueue('notif'),
  payments: () => getQueue('payments'),
  orders:   () => getQueue('orders'),
};

// ─── Helper d'ajout de jobs ──────────────────────────────────────

export const Jobs = {
  sendEmail:       (data: EmailJobData)             => queues.email().add(data.template, data),
  stockAlert:      (data: StockAlertJobData)        => queues.stock().add('alert', data),
  generateInvoice: (data: InvoiceJobData)           => queues.invoice().add('generate', data),
  notify:          (data: NotifJobData)             => queues.notif().add('push', data),
  paymentsQueue:   ()                               => queues.payments(),
  ordersQueue:     ()                               => queues.orders(),
};
