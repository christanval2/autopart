// ── Litiges (création acheteur + gestion admin) ────────────────
import { api, unwrap, unwrapWithPagination } from './client';
import type { Dispute, DisputeStatus } from '@autoparts/types';

export const disputesApi = {
  /** Liste — réservée super_admin (routes backend réelles). */
  async list(page = 1, limit = 20, status?: DisputeStatus) {
    return unwrapWithPagination<Dispute>(api.get('/disputes', { params: { page, limit, status } }));
  },

  /** Ouverture d'un litige par l'acheteur depuis sa commande. */
  async create(dto: { orderId: string; reason: string; description?: string }): Promise<Dispute> {
    return unwrap(api.post('/disputes', dto));
  },

  /** Arbitrage admin. */
  async update(id: string, dto: { status?: DisputeStatus; resolution?: string }): Promise<Dispute> {
    return unwrap(api.patch(`/disputes/${id}`, dto));
  },
};
