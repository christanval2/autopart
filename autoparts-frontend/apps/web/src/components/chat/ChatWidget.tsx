// ── ChatWidget AutoBot — coin bas-droit, toutes pages publiques ─
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { chatbotApi } from '@autoparts/api';
import { useAuthStore } from '@/store/auth.store';
import { storage, STORAGE_KEYS } from '@autoparts/utils';
import type { ChatMessage } from '@autoparts/types';

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Bonjour ! Je suis AutoBot 🤖 — posez vos questions : « Quel disque de frein pour Toyota Hilux 2018 ? »",
};

async function getSessionKey(): Promise<string> {
  let key = await storage.get<string>(STORAGE_KEYS.CONSENT + '.chat-session');
  if (!key) {
    key = `web-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    await storage.set(STORAGE_KEYS.CONSENT + '.chat-session', key);
  }
  return key;
}

export function ChatWidget() {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void getSessionKey().then((k) => {
      sessionKeyRef.current = k;
      // Restaure l'historique serveur de la session
      void chatbotApi.history(k).then((h) => {
        if (h && h.length > 0) setMessages([WELCOME, ...h]);
      }).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, typing, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || !sessionKeyRef.current) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setTyping(true);
    try {
      const reply = await chatbotApi.send(text, sessionKeyRef.current, user?.id);
      setMessages((m) => [...m, { role: 'assistant', content: reply.content }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: "Désolé, je n'ai pas pu traiter votre message. Réessayez." },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const clear = async () => {
    if (sessionKeyRef.current) await chatbotApi.clear(sessionKeyRef.current).catch(() => undefined);
    setMessages([WELCOME]);
  };

  return (
    <>
      {/* Bouton flottant */}
      {!open && (
        <button
          className="fixed bottom-6 right-6 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le chat AutoBot"
        >
          <MessageCircle strokeWidth={1.5} className="h-6 w-6" />
        </button>
      )}

      {open && (
        <motion.div
          className="fixed bottom-6 right-6 z-[80] flex h-[480px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card border border-border bg-card shadow-2xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <MessageCircle strokeWidth={1.5} className="h-5 w-5" />
            <div className="flex-1">
              <div className="text-sm font-semibold">AutoBot</div>
              <div className="text-[10px] opacity-80">Assistant pièces auto — réponse immédiate</div>
            </div>
            <button className="opacity-70 hover:opacity-100" onClick={() => void clear()} aria-label="Effacer">
              <Trash2 strokeWidth={1.5} className="h-4 w-4" />
            </button>
            <button className="opacity-70 hover:opacity-100" onClick={() => setOpen(false)} aria-label="Fermer">
              <X strokeWidth={1.5} className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-input px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {m.content}
              </div>
            ))}
            {typing && (
              <div className="w-16 rounded-input bg-muted px-3 py-2">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:240ms]" />
                </span>
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              className="flex-1 rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Votre question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-input bg-accent p-2 text-primary-foreground hover:bg-accent/90 disabled:opacity-40"
              disabled={!input.trim()}
              aria-label="Envoyer"
            >
              <Send strokeWidth={1.5} className="h-4 w-4" />
            </button>
          </form>
        </motion.div>
      )}
    </>
  );
}
