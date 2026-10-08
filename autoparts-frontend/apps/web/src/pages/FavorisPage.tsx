// ── Mes favoris (web) — API wishlist pour les connectés ────────
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, PriceTag, Skeleton } from '@autoparts/ui';
import { wishlistApi, mediaUrl } from '@autoparts/api';
import { useAuthStore } from '@/store/auth.store';

export default function FavorisPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: wishlistApi.list,
    enabled: isAuthenticated,
  });

  const remove = useMutation({
    mutationFn: (productId: string) => wishlistApi.remove(productId),
    onSuccess: () => {
      toast.success('Retiré de vos favoris');
      void qc.invalidateQueries({ queryKey: ['wishlist'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Connectez-vous pour retrouver vos favoris"
          description="Vos pièces favorites sont sauvegardées sur votre compte et synchronisées sur tous vos appareils."
          action={<Link to="/auth/connexion"><Button>Se connecter</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Mes favoris</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} pièce{items.length > 1 ? 's' : ''} sauvegardée{items.length > 1 ? 's' : ''}
          </p>
        </div>
        <Link to="/catalogue" className="text-sm font-medium text-primary hover:underline">
          Parcourir le catalogue
        </Link>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Aucun favori"
          description="Cliquez sur le cœur d'une fiche produit pour la retrouver ici."
          action={<Link to="/catalogue"><Button variant="outline">Voir le catalogue</Button></Link>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((w) => {
            const p = w.product;
            return (
              <Card key={w.id ?? w.productId} className="group overflow-hidden transition-shadow hover:shadow-card-hover">
                <Link to={p ? `/produits/${p.id}` : '#'} className="block">
                  <div className="flex aspect-square items-center justify-center bg-muted">
                    {p?.images?.[0] ? (
                      <img src={mediaUrl(p.images[0].sizes?.thumb ?? p.images[0].url)} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <Heart className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                    )}
                  </div>
                </Link>
                <CardContent className="space-y-2 p-3">
                  <Link to={p ? `/produits/${p.id}` : '#'} className="line-clamp-2 text-sm font-medium hover:text-primary">
                    {p?.name ?? w.productId.slice(0, 8)}
                  </Link>
                  {p?.basePrice != null && <PriceTag amount={p.basePrice} size="sm" />}
                  <div className="flex gap-1.5 pt-1">
                    {p && (
                      <Link to={`/produits/${p.id}`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full">Voir</Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        try {
                          await wishlistApi.remove(w.productId);
                          toast.success('Retiré des favoris');
                          void qc.invalidateQueries({ queryKey: ['wishlist'] });
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
