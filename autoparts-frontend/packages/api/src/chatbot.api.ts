// ── AutoBot chatbot textuel (coin bas-droit) ───────────────────
import { api, unwrap } from './client';
import type { ChatMessage, ChatbotStatusResponse } from '@autoparts/types';

export const chatbotApi = {
  /** L'API renvoie {reply, sessionKey, toolsUsed} — mappé en ChatMessage. */
  async send(message: string, sessionKey: string, userId?: string): Promise<ChatMessage> {
    const data = await unwrap<{ reply: string; sessionKey: string; toolsUsed: string[] }>(
      // Timeout dédié 90 s : la boucle d'outils du chatbot (recherche BD +
      // reformulation LLM) dépasse souvent le timeout global de 30 s.
      api.post(
        '/chatbot/message',
        { message, sessionKey, context: userId ? { userId } : undefined },
        { timeout: 90_000 },
      ),
    );
    return { role: 'assistant', content: data.reply, ts: Date.now() } as ChatMessage;
  },
  async history(sessionKey: string): Promise<ChatMessage[]> {
    return unwrap(api.get(`/chatbot/history/${encodeURIComponent(sessionKey)}`));
  },
  async clear(sessionKey: string): Promise<void> {
    await unwrap(api.delete(`/chatbot/history/${encodeURIComponent(sessionKey)}`));
  },
  async status(): Promise<ChatbotStatusResponse> {
    return unwrap(api.get('/chatbot/status'));
  },
};
