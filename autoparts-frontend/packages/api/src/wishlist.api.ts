// ── Wishlist / favoris ─────────────────────────────────────────
import { api, unwrap } from './client';

export interface WishlistItem {
  id?: string;
  productId: string;
  product?: { id: string; name: string; basePrice: number; images?: { url: string }[] };
  addedAt?: string;
}

export const wishlistApi = {
  async list(): Promise<WishlistItem[]> {
    return unwrap(api.get('/wishlist'));
  },
  async add(productId: string): Promise<unknown> {
    return unwrap(api.post('/wishlist', { productId }));
  },
  async remove(productId: string): Promise<void> {
    await unwrap(api.delete(`/wishlist/${productId}`));
  },
  async check(productId: string): Promise<{ inWishlist: boolean }> {
    return unwrap(api.get(`/wishlist/check/${productId}`));
  },
};
