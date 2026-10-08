// ── Messagerie interne acheteur ↔ vendeur ──────────────────────
import { api, unwrap } from './client';
import type { Message } from '@autoparts/types';

export const messagingApi = {
  async inbox(): Promise<Message[]> {
    return unwrap(api.get('/messages/inbox'));
  },
  async sent(): Promise<Message[]> {
    return unwrap(api.get('/messages/sent'));
  },
  async unreadCount(): Promise<{ count: number }> {
    return unwrap(api.get('/messages/unread-count'));
  },
  async thread(userId: string): Promise<Message[]> {
    return unwrap(api.get(`/messages/thread/${userId}`));
  },
  async send(dto: { recipientId: string; subject?: string; body: string }): Promise<Message> {
    return unwrap(api.post('/messages', dto));
  },
  async markRead(id: string): Promise<void> {
    await unwrap(api.patch(`/messages/${id}/read`));
  },
};
