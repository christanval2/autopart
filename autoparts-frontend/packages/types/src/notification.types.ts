// ── Notifications, messages, AutoBot ───────────────────────────
import type { ISODate } from './common';

export type NotificationType =
  | 'order_update'
  | 'stock_alert'
  | 'payment'
  | 'promo'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: ISODate;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  subject?: string | null;
  body: string;
  isRead?: boolean;
  createdAt?: ISODate;
  sender?: { id: string; firstName: string; lastName: string };
  recipient?: { id: string; firstName: string; lastName: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: ISODate;
}

export interface ChatbotStatusResponse {
  available: boolean;
  provider?: string;
  [key: string]: unknown;
}

// ── Événements Socket.io (notifications temps réel) ────────────
export interface SocketNotificationEvent {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  createdAt: ISODate;
}
