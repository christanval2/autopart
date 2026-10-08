// ── Section avis d'une fiche produit (liste + formulaire) ──────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, RatingStars, Textarea } from '@autoparts/ui';
import { reviewsApi } from '@autoparts/api';
import { formatDate } from '@autoparts/utils';
import { useAuthStore } from '@/store/auth.store';

export function ProductReviewsSection({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const { data: ratingSummary } = useQuery({
    queryKey: ['reviews', 'rating', productId],
    queryFn: () => reviewsApi.productRating(productId),
  });

  const { data: reviews } = useQuery({
    queryKey: ['reviews', 'list', productId],
    queryFn: () => reviewsApi.list({ productId, limit: 20 }),
  });

  const submit = useMutation({
    mutationFn: () => reviewsApi.create({ productId, rating, comment }),
    onSuccess: () => {
      toast.success('Merci pour votre avis !');
      setComment('');
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* Résumé */}
      <Card className="h-fit">
        <CardContent className="space-y-3 text-center">
          <div className="text-4xl font-extrabold">
            {(ratingSummary?.average ?? 0).toFixed(1)}
          </div>
          <RatingStars value={ratingSummary?.average ?? 0} size={20} />
          <p className="text-sm text-muted-foreground">{ratingSummary?.count ?? 0} avis vérifiés</p>
          <p className="text-xs text-muted-foreground">
            Seuls les clients ayant reçu le produit peuvent laisser un avis (achat vérifié).
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Formulaire */}
        {isAuthenticated && (
          <Card>
            <CardContent className="space-y-3">
              <h3 className="font-semibold">Laisser un avis</h3>
              <RatingStars value={rating} size={24} onChange={setRating} />
              <Textarea
                placeholder="Votre expérience avec ce produit (10 caractères minimum)…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button
                size="sm"
                loading={submit.isPending}
                disabled={comment.trim().length < 10}
                onClick={() => submit.mutate()}
              >
                Publier mon avis
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Liste */}
        {(reviews?.items ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <RatingStars value={r.rating} />
                <span className="text-sm font-medium">
                  {r.user ? `${r.user.firstName} ${r.user.lastName.charAt(0)}.` : 'Client'}
                </span>
                {r.isVerifiedPurchase && (
                  <Badge tone="success">
                    <BadgeCheck strokeWidth={1.5} className="h-3 w-3" /> Achat vérifié
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
              {r.sellerReply && (
                <div className="rounded-input bg-muted/50 p-3 text-sm">
                  <div className="mb-1 text-xs font-semibold text-primary">Réponse du vendeur</div>
                  {r.sellerReply}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {(reviews?.items.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucun avis pour le moment — soyez le premier !
          </p>
        )}
      </div>
    </div>
  );
}
