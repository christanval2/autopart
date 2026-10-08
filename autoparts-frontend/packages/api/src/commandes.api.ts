// ── Commandes, commandes récurrentes, approbations B2B ────────
import { api, unwrap, unwrapWithPagination } from './client';
import type {
  Order, OrderStats, CreateOrderDto, OrderStatus,
  OrderApproval,
} from '@autoparts/types';
import type { Pagination } from './client';

export interface OrderListQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  channel?: string;
  startDate?: string;
  endDate?: string;
  mine?: boolean;
}

export const ordersApi = {
  async list(query: OrderListQuery = {}) {
    return unwrapWithPagination<Order>(api.get('/orders', { params: query }));
  },

  async stats(): Promise<OrderStats> {
    return unwrap(api.get('/orders/stats'));
  },

  async byId(id: string): Promise<Order> {
    return unwrap(api.get(`/orders/${id}`));
  },

  async create(dto: CreateOrderDto): Promise<Order> {
    return unwrap(api.post('/orders', dto));
  },

  /** Transition de statut (vendeur/admin/logistics). */
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return unwrap(api.patch(`/orders/${id}/status`, { status }));
  },

  /** Confirmation par l'acheteur (draft → confirmed). */
  async confirm(id: string): Promise<Order> {
    return unwrap(api.post(`/orders/${id}/confirm`));
  },

  // ── Approbation B2B (V2 backend dispo) ──────────────────────
  async pendingApprovals() {
    return unwrapWithPagination<OrderApproval>(api.get('/orders/approvals/pending'));
  },
  async approve(id: string, reason?: string): Promise<void> {
    await unwrap(api.post(`/orders/approvals/${id}/approve`, { reason }));
  },
  async reject(id: string, reason?: string): Promise<void> {
    await unwrap(api.post(`/orders/approvals/${id}/reject`, { reason }));
  },
};

export interface RecurringOrder {
  id: string;
  sellerOrgId?: string;
  lines: Array<{ variantId: string; quantity: number }>;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  nextRun?: string;
  isActive?: boolean;
}

export const recurringOrdersApi = {
  async list(): Promise<RecurringOrder[]> {
    return unwrap(api.get('/orders/recurring'));
  },
  async create(dto: {
    sellerOrgId?: string;
    lines: Array<{ variantId: string; quantity: number }>;
    frequency: RecurringOrder['frequency'];
    nextRun?: string;
  }): Promise<RecurringOrder> {
    return unwrap(api.post('/orders/recurring', dto));
  },
  async toggle(id: string): Promise<RecurringOrder> {
    return unwrap(api.patch(`/orders/recurring/${id}/toggle`));
  },
  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/orders/recurring/${id}`));
  },
};

// Re-export pour imports homogènes dans les pages
export type { Pagination };
