// ── Recherche, suggestions, session vocale ─────────────────────
import type { Product } from './product.types';

export interface SearchResult {
  items: Product[];
  pagination?: { page: number; limit: number; total: number };
}

export interface Suggestion {
  type: 'product' | 'brand' | 'category' | 'vehicle_make';
  label: string;
  id?: string;
  productId?: string;
}

export interface VehicleModel {
  make: string;
  model: string;
}

export interface VoiceSession {
  sessionId: string;
  roomName: string;
  /** Token LiveKit du client (identité customer-*). */
  token: string;
  /** URL LiveKit renvoyée par le backend. */
  agentUrl: string;
  agentDispatched: boolean;
}
