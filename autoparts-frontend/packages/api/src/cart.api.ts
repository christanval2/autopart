// ── Panier serveur (authentifié) ───────────────────────────────
import { api, unwrap } from './client';
import type { CartDetailed } from '@autoparts/types';

export const cartApi = {
  async get(): Promise<CartDetailed> {
    return unwrap(api.get('/cart'));
  },
  async addItem(variantId: string, quantity: number): Promise<unknown> {
    return unwrap(api.post('/cart/items', { variantId, quantity }));
  },
  async updateItem(itemId: string, quantity: number): Promise<unknown> {
    return unwrap(api.patch(`/cart/items/${itemId}`, { quantity }));
  },
  async removeItem(itemId: string): Promise<void> {
    await unwrap(api.delete(`/cart/items/${itemId}`));
  },
  async clear(): Promise<void> {
    await unwrap(api.delete('/cart'));
  },
};
