// ── AutoBot vocal (LiveKit) — POST/DELETE /voice-order/* ───────
import { api, unwrap } from './client';
import type { VoiceSession } from '@autoparts/types';

export const voiceOrderApi = {
  async createSession(): Promise<VoiceSession> {
    return unwrap(api.post('/voice-order/session'));
  },

  async agentToken(roomName: string, sessionId: string): Promise<string> {
    const r = await unwrap<{ token: string }>(api.post('/voice-order/agent-token', { roomName, sessionId }));
    return r.token;
  },

  async endSession(roomName: string): Promise<void> {
    await unwrap(api.delete(`/voice-order/session/${encodeURIComponent(roomName)}`));
  },

  async status(): Promise<{ available: boolean; [key: string]: unknown }> {
    return unwrap(api.get('/voice-order/status'));
  },
};
