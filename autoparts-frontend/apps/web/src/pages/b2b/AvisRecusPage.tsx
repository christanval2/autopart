// ── Avis reçus (vendeur) : réponses publiques aux avis ────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {Skeleton, Badge, Button, Card, CardContent, RatingStars, Textarea, Modal } from '@autoparts/ui';
import { reviewsApi } from '@autoparts/api';
import { formatDate } from '@autoparts/utils';
import type { Review } from '@autoparts/types';

export default function AvisRecusPage() {
  const qc = useQueryClient();
  const [replyTarget, setReplyTarget] = useState<Review | null>(null);
  const [reply, setReply] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['b2b', 'reviews'],
    queryFn: () => reviewsApi.list({ limit: 50 }),
  });

  const sendReply = useMutation({
    mutationFn: () => reviewsApi.reply(replyTarget!.id, reply),
    onSuccess: () => {
      toast.success('Réponse publiée');
      setReplyTarget(null);
      setReply('');
      void qc.invalidateQueries({ queryKey: ['b2b', 'reviews'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviews = data?.items ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Avis reçus</h1>
        <p className="text-sm text-muted-foreground">
          Répondez publiquement aux avis clients — visible sur la fiche produit.
        </p>
      </header>

      {isLoading && <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>}

      {!isLoading && reviews.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucun avis reçu pour le moment.</p>
      )}

      <div className="grid gap-3">
        {reviews.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <RatingStars value={r.rating} />
                <span className="text-sm font-medium">
                  {r.user ? `${r.user.firstName} ${r.user.lastName.charAt(0)}.` : 'Client'}
                </span>
                {r.isVerifiedPurchase && <Badge tone="success">Achat vérifié</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
              {r.sellerReply ? (
                <div className="rounded-input bg-muted/50 p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-primary">Votre réponse</div>
                  {r.sellerReply}
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setReplyTarget(r); setReply(''); }}>
                  Répondre
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={Boolean(replyTarget)} onClose={() => setReplyTarget(null)} title="Répondre à l'avis">
        <div className="space-y-3">
          <RatingStars value={replyTarget?.rating ?? 0} />
          <Textarea
            placeholder="Votre réponse publique (professionnelle et courtoise)…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReplyTarget(null)}>Annuler</Button>
            <Button size="sm" loading={sendReply.isPending} disabled={reply.trim().length < 5} onClick={() => sendReply.mutate()}>
              Publier la réponse
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
