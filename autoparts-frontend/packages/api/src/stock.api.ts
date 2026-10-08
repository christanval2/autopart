// ── Stock : entrepôts, niveaux, alertes, mouvements, inventaires ──
import { api, unwrap, unwrapWithPagination } from './client';
import type { StockLevel, StockAlert, StockMovement, Warehouse } from '@autoparts/types';
import type { Pagination } from './client';

export interface StockAudit {
  id: string;
  warehouseId: string;
  status?: string;
  variantIds?: string[];
  results?: Array<{ variantId: string; counted: number }>;
  createdAt?: string;
}

export interface PickList {
  id: string;
  orderId: string;
  warehouseId?: string;
  status?: string;
  assigneeId?: string | null;
  createdAt?: string;
}

export const stockApi = {
  /** Niveaux de stock (qtyOnHand / qtyReserved) par entrepôt. */
  async levels(params: { warehouseId?: string; page?: number; limit?: number }) {
    return unwrapWithPagination<StockLevel>(api.get('/stock', { params }));
  },

  async alerts(): Promise<StockAlert[]> {
    return unwrap(api.get('/stock/alerts'));
  },

  async movements(params: { page?: number; limit?: number; variantId?: string; warehouseId?: string }) {
    return unwrapWithPagination<StockMovement>(api.get('/stock/movements', { params }));
  },

  /** Prévisions de réapprovisionnement (module IA V3 déjà exposé). */
  async forecasts(): Promise<unknown[]> {
    return unwrap(api.get('/stock/forecasts'));
  },

  async warehouses(): Promise<Warehouse[]> {
    return unwrap(api.get('/stock/warehouses'));
  },

  async createWarehouse(dto: { name: string; location?: string }): Promise<Warehouse> {
    return unwrap(api.post('/stock/warehouses', dto));
  },

  async set(dto: { warehouseId: string; variantId: string; quantity: number }): Promise<void> {
    await unwrap(api.post('/stock/set', dto));
  },

  async adjust(dto: { warehouseId: string; variantId: string; delta: number; reason: string }): Promise<void> {
    await unwrap(api.post('/stock/adjust', dto));
  },

  async transfer(dto: {
    fromWarehouseId: string;
    toWarehouseId: string;
    variantId: string;
    quantity: number;
  }): Promise<void> {
    await unwrap(api.post('/stock/transfer', dto));
  },
};

// ── Inventaires (comptage physique) ────────────────────────────
export const stockAuditsApi = {
  async list(): Promise<StockAudit[]> {
    return unwrap(api.get('/stock-audits'));
  },
  async create(dto: { warehouseId: string; variantIds?: string[] }): Promise<StockAudit> {
    return unwrap(api.post('/stock-audits', dto));
  },
  async start(id: string): Promise<StockAudit> {
    return unwrap(api.post(`/stock-audits/${id}/start`));
  },
  async submit(id: string, results: Array<{ variantId: string; counted: number }>): Promise<StockAudit> {
    return unwrap(api.post(`/stock-audits/${id}/submit`, { results }));
  },
};

// ── Préparation de commandes (picking) ─────────────────────────
export const pickingApi = {
  async list(page = 1, limit = 20): Promise<{ items: PickList[]; pagination?: Pagination }> {
    return unwrapWithPagination<PickList>(api.get('/picking', { params: { page, limit } }));
  },
  async create(dto: { orderId: string; warehouseId: string }): Promise<PickList> {
    return unwrap(api.post('/picking', dto));
  },
  async assign(id: string, userId?: string): Promise<PickList> {
    return unwrap(api.post(`/picking/${id}/assign`, { userId }));
  },
  async update(id: string, dto: { status?: string }): Promise<PickList> {
    return unwrap(api.patch(`/picking/${id}`, dto));
  },
};
