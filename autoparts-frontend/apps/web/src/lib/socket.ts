// ── Socket.io singleton (notifications temps réel) ─────────────
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL, authBridge } from '@autoparts/api';
import type { SocketNotificationEvent } from '@autoparts/types';

let socket: Socket | null = null;
const listeners = new Set<(n: SocketNotificationEvent) => void>();

export function getSocket(): Socket | null {
  if (socket) return socket;

  const token = authBridge.getTokens()?.accessToken;
  if (!token) return null;

  socket = io(SOCKET_URL, {
    // Le backend vérifie socket.handshake.auth.token (JWT accès)
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
  });

  socket.on('notification', (payload: SocketNotificationEvent) => {
    listeners.forEach((cb) => cb(payload));
  });

  socket.on('connect_error', () => {
    // token expiré → reconnectera avec le nouveau token après refresh
    if (socket) socket.auth = { token: authBridge.getTokens()?.accessToken };
  });

  return socket;
}

/** Abonne le UI aux notifications push (retourne la fonction de désabonnement). */
export function onNotification(cb: (n: SocketNotificationEvent) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
