// ── Analytics & reporting (dashboards vendeur + admin) ─────────
import { api, unwrap } from './client';
import type { TopProduct, RevenueByCategory, TimelinePoint, ConversionStats } from '@autoparts/types';

export const analyticsApi = {
  async topProducts(limit = 10, orgId?: string): Promise<TopProduct[]> {
    return unwrap(api.get('/analytics/products/top', { params: { limit, orgId } }));
  },
  async slowMovers(limit = 10, orgId?: string): Promise<TopProduct[]> {
    return unwrap(api.get('/analytics/products/slow', { params: { limit, orgId } }));
  },
  async revenueByCategory(orgId?: string): Promise<RevenueByCategory[]> {
    return unwrap(api.get('/analytics/categories', { params: { orgId } }));
  },
  /** granularity: day | week | month */
  async timeline(granularity: 'day' | 'week' | 'month' = 'month', orgId?: string): Promise<TimelinePoint[]> {
    return unwrap(api.get('/analytics/timeline', { params: { granularity, orgId } }));
  },
  async conversion(): Promise<ConversionStats> {
    return unwrap(api.get('/analytics/conversion'));
  },
  async priceHistory(productId: string): Promise<Array<{ date: string; price: number }>> {
    return unwrap(api.get(`/analytics/price-history/${productId}`));
  },
};
