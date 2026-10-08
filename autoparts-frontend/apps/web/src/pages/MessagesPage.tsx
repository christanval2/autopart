// ── Messagerie interne : inbox, envoyés, conversation ─────────
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, Input, Textarea } from '@autoparts/ui';
import { messagingApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Message } from '@autoparts/types';

type Tab = 'inbox' | 'sent';

export default function MessagesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('inbox');
  const [threadWith, setThreadWith] = useState<Message['senderId' | 'recipientId'] | null>(null);
  const [reply, setReply] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: inbox = [] } = useQuery({ queryKey: ['messages', 'inbox'], queryFn: messagingApi.inbox });
  const { data: sent = [] } = useQuery({ queryKey: ['messages', 'sent'], queryFn: messagingApi.sent });

  const list = tab === 'inbox' ? inbox : sent;

  // Conversations regroupées par interlocuteur
  const conversations = useMemo(() => {
    const map = new Map<string, { other: string; last: Message; unread: number }>();
    for (const m of list) {
      const other = m.senderId === user?.id ? m.recipientId : m.senderId;
      const existing = map.get(other);
      const unreadInc = tab === 'inbox' && !m.isRead && m.recipientId === user?.id ? 1 : 0;
      if (!existing) {
        map.set(other, { other, last: m, unread: unreadInc });
      } else {
        existing.unread += unreadInc;
      }
    }
    return Array.from(map.values());
  }, [list, tab, user?.id]);

  const { data: thread = [] } = useQuery({
    queryKey: ['messages', 'thread', threadWith],
    queryFn: () => messagingApi.thread(threadWith!),
    enabled: Boolean(threadWith),
  });

  const send = useMutation({
    mutationFn: (dto: { recipientId: string; subject?: string; body: string }) => messagingApi.send(dto),
    onSuccess: (m) => {
      toast.success('Message envoyé');
      setReply('');
      setNewOpen(false);
      setSubject('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['messages'] });
      if (threadWith) setThreadWith(threadWith ?? m.recipientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openThread = async (otherId: string) => {
    setThreadWith(otherId);
    // marque les messages reçus non-lus de ce fil
    for (const m of inbox.filter((x) => x.senderId === otherId && !x.isRead)) {
      await messagingApi.markRead(m.id).catch(() => undefined);
    }
    void qc.invalidateQueries({ queryKey: ['messages'] });
  };

  const otherName = (m: Message) => {
    const p = m.senderId === user?.id ? m.recipient : m.sender;
    return p ? `${p.firstName} ${p.lastName}` : m.senderId === user?.id ? m.recipientId?.slice(0, 8) : m.senderId?.slice(0, 8);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-sm text-muted-foreground">Messagerie avec les vendeurs et les acheteurs.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'inbox' ? 'primary' : 'outline'} onClick={() => setTab('inbox')}>
            Reçus
          </Button>
          <Button size="sm" variant={tab === 'sent' ? 'primary' : 'outline'} onClick={() => setTab('sent')}>
            Envoyés
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>+ Nouveau</Button>
        </div>
      </header>

      {threadWith ? (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Conversation</h2>
              <Button size="sm" variant="ghost" onClick={() => setThreadWith(null)}>← Retour</Button>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {thread.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-input px-3 py-2 text-sm ${
                    m.senderId === user?.id
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {m.subject && <div className="mb-0.5 text-xs font-semibold opacity-80">{m.subject}</div>}
                  {m.body}
                  <div className="mt-1 text-[10px] opacity-70">{formatDateTime(m.createdAt)}</div>
                </div>
              ))}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) send.mutate({ recipientId: threadWith, body: reply });
              }}
            >
              <Input
                placeholder="Votre réponse…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button type="submit" loading={send.isPending}>Envoyer</Button>
            </form>
          </CardContent>
        </Card>
      ) : conversations.length === 0 ? (
        <EmptyState
          title="Aucun message"
          description="Les conversations avec les vendeurs apparaîtront ici."
        />
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Card key={c.other} className="cursor-pointer hover:border-primary" onClick={() => void openThread(c.other)}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{otherName(c.last)}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">
                    {c.last.subject ? `${c.last.subject} — ` : ''}{c.last.body}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(c.last.createdAt)}</span>
                {c.unread > 0 && <Badge tone="accent">{c.unread} non lu(s)</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {threadWith && !thread.length && (
        <Textarea placeholder="Réponse…" value={reply} onChange={(e) => setReply(e.target.value)} />
      )}

      {newOpen && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-semibold">Nouveau message</h2>
            <Input
              placeholder="ID du destinataire (UUID)"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            />
            <Input placeholder="Objet" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNewOpen(false)}>Annuler</Button>
              <Button
                size="sm"
                loading={send.isPending}
                disabled={!recipientId || !body.trim()}
                onClick={() => send.mutate({ recipientId, subject: subject || undefined, body })}
              >
                Envoyer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
