// ── Recherche : full-text, véhicule, autocomplete, historique ──
import { api, unwrap, unwrapWithPagination } from './client';
import type { Product, VehicleModel } from '@autoparts/types';

export interface SearchParams {
  q?: string;
  page?: number;
  limit?: number;
}

export const searchApi = {
  /** Recherche full-text (SKU → OEM → rang full-text) — route publique. */
  async search(params: SearchParams) {
    return unwrapWithPagination<Product>(api.get('/search', { params }));
  },

  /** Wizard marque → modèle → année (cascade) — route publique. */
  async byVehicle(params: { make?: string; model?: string; year?: number; page?: number; limit?: number }) {
    return unwrapWithPagination<Product>(api.get('/search/vehicle', { params }));
  },

  /** Suggestions <100ms (produits, marques, catégories) — route publique. */
  async autocomplete(q: string): Promise<unknown[]> {
    return unwrap(api.get('/search/autocomplete', { params: { q } }));
  },

  /** L'API renvoie [{make, product_count}] — on extrait la marque. */
  async vehicleMakes(): Promise<string[]> {
    const rows = await unwrap<Array<string | { make?: string }>>(api.get('/search/vehicle/makes'));
    return rows
      .map((r) => (typeof r === 'string' ? r : r?.make ?? ''))
      .filter((m): m is string => Boolean(m));
  },

  async vehicleModels(make: string): Promise<VehicleModel[]> {
    return unwrap(api.get(`/search/vehicle/models/${encodeURIComponent(make)}`));
  },

  /** Historique (auth requis) — 10 dernières recherches côté Redis. */
  async history(): Promise<string[]> {
    return unwrap(api.get('/search/history'));
  },

  async clearHistory(): Promise<void> {
    await unwrap(api.delete('/search/history'));
  },
};
