// ── Notifications in-app (cloche, liste, lu/non-lu) ────────────
import { api, unwrap, unwrapWithPagination } from './client';
import type { AppNotification } from '@autoparts/types';

export const notificationsApi = {
  async list(page = 1, limit = 30): Promise<{ items: AppNotification[]; pagination?: { page: number; limit: number; total: number; totalPages?: number } }> {
    return unwrapWithPagination<AppNotification>(api.get('/notifications', { params: { page, limit } }));
  },

  async unreadCount(): Promise<number> {
    const r = await unwrap<{ count: number }>(api.get('/notifications/unread-count'));
    return Number(r?.count ?? 0);
  },

  async markRead(id: string): Promise<void> {
    await unwrap(api.patch(`/notifications/${id}/read`));
  },

  async markAllRead(): Promise<void> {
    await unwrap(api.patch('/notifications/read-all'));
  },
};
