// ── Avis produits vérifiés + modération + réponses vendeur ────
import { api, unwrap, unwrapWithPagination } from './client';
import type { Review, ProductRating } from '@autoparts/types';

export const reviewsApi = {
  /** status : visible (défaut) | pending | rejected | all — filtre serveur. */
  async list(params: {
    productId?: string;
    page?: number;
    limit?: number;
    rating?: number;
    status?: 'visible' | 'pending' | 'rejected' | 'all';
  }) {
    return unwrapWithPagination<Review>(api.get('/reviews', { params }));
  },

  async productRating(productId: string): Promise<ProductRating> {
    return unwrap(api.get(`/reviews/product/${productId}/rating`));
  },

  /** Créé par un acheteur ; le backend vérifie l'achat (badge « Achat vérifié »). */
  async create(dto: { productId: string; rating: number; comment?: string }): Promise<Review> {
    return unwrap(api.post('/reviews', dto));
  },

  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/reviews/${id}`));
  },

  /** Réponse du vendeur visible sous l'avis. */
  async reply(id: string, sellerReply: string): Promise<Review> {
    return unwrap(api.post(`/reviews/${id}/reply`, { sellerReply }));
  },

  /** Modération admin : status approved | pending | rejected. */
  async moderate(id: string, status: 'approved' | 'pending' | 'rejected', rejectionReason?: string) {
    return unwrap(api.post(`/reviews/${id}/moderate`, { status, rejectionReason }));
  },
};
