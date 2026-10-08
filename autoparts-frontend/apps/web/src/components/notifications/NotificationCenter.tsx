// ── NotificationCenter temps réel (cloche header, Socket.io) ────
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, unwrap } from '@autoparts/api';
import { Dropdown, DropdownItem } from '@autoparts/ui';
import { timeAgo } from '@autoparts/utils';
import { getSocket, onNotification } from '@/lib/socket';
import type { AppNotification } from '@autoparts/types';

async function fetchNotifications(): Promise<AppNotification[]> {
  return unwrap(api.get('/notifications', { params: { limit: 10 } }));
}

async function fetchUnreadCount(): Promise<number> {
  const r = await unwrap<{ count: number }>(api.get('/notifications/unread-count'));
  return r.count;
}

export function NotificationCenter() {
  const qc = useQueryClient();
  const [live, setLive] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 120_000,
  });
  const { data: items } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: fetchNotifications,
  });

  // Connexion temps réel : badge + toasts instantanés
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    setLive(socket.connected);

    const off = onNotification((n) => {
      toast(n.title, { description: n.body });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    const onConnect = () => setLive(true);
    const onDisconnect = () => setLive(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      off();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: (id: string) => unwrap(api.patch(`/notifications/${id}/read`, {})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => unwrap(api.patch('/notifications/read-all', {})),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <Dropdown
      trigger={
        <span className="relative rounded p-2 hover:bg-muted">
          <Bell strokeWidth={1.5} className="h-5 w-5" />
          {(unread ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
          {live && (
            <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-success" title="Temps réel connecté" />
          )}
        </span>
      }
    >
      <div className="w-80">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notifications
          </span>
          <button
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            onClick={() => markAll.mutate()}
          >
            <CheckCheck strokeWidth={1.5} className="h-3 w-3" /> Tout marquer lu
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(items ?? []).length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune notification</div>
          ) : (
            (items ?? []).map((n) => (
              <button
                key={n.id}
                className={`block w-full border-t border-border px-4 py-2.5 text-left hover:bg-muted ${
                  !n.isRead ? 'bg-primary/10 dark:bg-primary/10' : ''
                }`}
                onClick={() => !n.isRead && markRead.mutate(n.id)}
              >
                <div className="flex items-center gap-2">
                  {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                <div className="mt-1 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</div>
              </button>
            ))
          )}
        </div>
        <DropdownItem onClick={() => { window.location.href = '/messages'; }}>
          Voir tous les messages
        </DropdownItem>
      </div>
    </Dropdown>
  );
}
