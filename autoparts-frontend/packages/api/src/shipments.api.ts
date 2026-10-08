// ── Expéditions & suivi colis ──────────────────────────────────
import { api, unwrap, unwrapWithPagination } from './client';
import type { Shipment, TrackedShipment } from '@autoparts/types';

export const shipmentsApi = {
  /** Page de suivi publique (sans connexion) — réponse enrichie trajet. */
  async track(trackingNumber: string): Promise<TrackedShipment> {
    return unwrap(api.get(`/shipments/track/${encodeURIComponent(trackingNumber)}`));
  },

  async list(page = 1, limit = 20) {
    return unwrapWithPagination<Shipment>(api.get('/shipments', { params: { page, limit } }));
  },

  async byId(id: string): Promise<Shipment> {
    return unwrap(api.get(`/shipments/${id}`));
  },

  async create(dto: { orderId: string; carrier?: string; trackingNumber?: string }): Promise<Shipment> {
    return unwrap(api.post('/shipments', dto));
  },

  async update(id: string, dto: Partial<Pick<Shipment, 'status' | 'carrier' | 'trackingNumber'>>) {
    return unwrap(api.patch(`/shipments/${id}`, dto));
  },

  async clickCollect(dto: { orderId: string; pickupPoint?: string }) {
    return unwrap(api.post('/shipments/click-collect', dto));
  },
};
