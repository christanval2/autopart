// ── Tarification B2B : devis, bons de commande, prix contractuels ──
import { api, unwrap } from './client';
import type { Quote, PurchaseOrder, PriceContract, QuoteItem, PurchaseOrderItem } from '@autoparts/types';

export const quotesApi = {
  async mine(): Promise<Quote[]> {
    return unwrap(api.get('/quotes'));
  },
  async org(): Promise<Quote[]> {
    return unwrap(api.get('/quotes/org'));
  },
  async create(dto: {
    /** Flux vendeur : omis = org de l'appelant. Flux acheteur : vendeur ciblé. */
    sellerOrgId?: string;
    lines: QuoteItem[];
    validUntil?: string;
  }): Promise<Quote> {
    return unwrap(api.post('/quotes', dto));
  },
  async byId(id: string): Promise<Quote> {
    return unwrap(api.get(`/quotes/${id}`));
  },
  async send(id: string): Promise<Quote> {
    return unwrap(api.post(`/quotes/${id}/send`));
  },
  async accept(id: string): Promise<Quote> {
    return unwrap(api.post(`/quotes/${id}/accept`));
  },
  async reject(id: string): Promise<Quote> {
    return unwrap(api.post(`/quotes/${id}/reject`));
  },
};

export const purchaseOrdersApi = {
  async list(): Promise<PurchaseOrder[]> {
    return unwrap(api.get('/purchase-orders'));
  },
  /** Contrat backend : supplierName + warehouseId + lines (avec sku). */
  async create(dto: {
    supplierName: string;
    supplierEmail?: string;
    warehouseId: string;
    lines: PurchaseOrderItem[];
    expectedAt?: string;
    notes?: string;
  }): Promise<PurchaseOrder> {
    return unwrap(api.post('/purchase-orders', dto));
  },
  async send(id: string): Promise<PurchaseOrder> {
    return unwrap(api.post(`/purchase-orders/${id}/send`));
  },
  async receive(id: string, lines: Array<{ variantId: string; quantityReceived: number }>): Promise<PurchaseOrder> {
    return unwrap(api.post(`/purchase-orders/${id}/receive`, { lines }));
  },
};

export const priceContractsApi = {
  async list(): Promise<PriceContract[]> {
    return unwrap(api.get('/price-contracts'));
  },
  async create(dto: {
    buyerOrgId: string;
    variantId: string;
    contractPrice: number;
    validUntil?: string;
  }): Promise<PriceContract> {
    return unwrap(api.post('/price-contracts', dto));
  },
  async deactivate(id: string): Promise<void> {
    await unwrap(api.delete(`/price-contracts/${id}`));
  },
};
