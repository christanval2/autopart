// ── Livraison : zones & frais (/shipping/*) ────────────────────
// Le suivi colis est dans shipments.api.ts (routes /shipments/*).
import { api, unwrap } from './client';
import type { ShippingZone } from '@autoparts/types';

export const shippingApi = {
  async zones(): Promise<ShippingZone[]> {
    return unwrap(api.get('/shipping/zones'));
  },
  async createZone(dto: Partial<ShippingZone> & { name: string; type: ShippingZone['type'] }): Promise<ShippingZone> {
    return unwrap(api.post('/shipping/zones', dto));
  },
  async updateZone(id: string, dto: Partial<ShippingZone>): Promise<ShippingZone> {
    return unwrap(api.patch(`/shipping/zones/${id}`, dto));
  },
  async deleteZone(id: string): Promise<void> {
    await unwrap(api.delete(`/shipping/zones/${id}`));
  },
  /** Simulateur de frais de livraison. */
  async quote(params: { zoneId?: string; weightKg?: number; subtotal?: number }): Promise<unknown> {
    return unwrap(api.get('/shipping/quote', { params }));
  },
};
