// ── Panier client — design moderne (cartes, images, récap collant) ──
import { Link } from 'react-router-dom';
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, EmptyState } from '@autoparts/ui';
import { mediaUrl } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import {
  useCartStore,
  selectCartItems,
  selectCartCount,
  selectCartSubtotal,
} from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';

interface Row {
  key: string;
  name: string;
  sku: string;
  image?: string | null;
  quantity: number;
  unitPrice: number;
  issues: string[];
  belowMoq?: boolean;
}

export default function PanierPage() {
  const { isAuthenticated } = useAuthStore();
  const serverItems = useCartStore(selectCartItems);
  const guestItems = useCartStore((s) => s.guestItems);
  const count = useCartStore(selectCartCount);
  const subtotal = useCartStore(selectCartSubtotal);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  const items: Row[] = isAuthenticated
    ? serverItems.map((i) => ({
        key: i.id,
        name: i.productName ?? i.variantSku ?? 'Article',
        sku: i.variantSku ?? '',
        image: i.image,
        quantity: i.quantity,
        unitPrice: i.currentPrice,
        issues: i.issues ?? [],
        belowMoq: i.issues?.some((x) => x.includes('MOQ') || x.includes('Quantit')),
      }))
    : guestItems.map((i) => ({
        key: i.variantId,
        name: i.productName,
        sku: i.variantSku,
        image: i.image,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        issues: [],
      }));

  const estimatedTax = subtotal * 0.1925;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Votre panier est vide"
          description="Parcourez le catalogue ou dictez votre commande vocalement pour commencer."
          action={<Link to="/catalogue"><Button>Voir le catalogue</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Mon panier</h1>
          <p className="text-sm text-muted-foreground">{count} article{count > 1 ? 's' : ''}</p>
        </div>
        <button className="text-sm text-muted-foreground transition-colors hover:text-destructive" onClick={() => void clear()}>
          Vider le panier
        </button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        {/* Lignes */}
        <ul className="space-y-3">
          {items.map((i) => (
            <li
              key={i.key}
              className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                {i.image ? (
                  <img src={mediaUrl(i.image)} alt={i.name} className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.sku}</div>
                  </div>
                  <button
                    aria-label="Retirer"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    onClick={() => void removeItem(i.key)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
                {i.issues?.map((issue) => (
                  <div key={issue} className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" strokeWidth={1.5} /> {issue}
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-between">
                  {/* Stepper compact */}
                  <div className="inline-flex h-8 items-center rounded-lg border border-input">
                    <button
                      className="flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                      disabled={i.quantity <= 1}
                      onClick={() => void updateQuantity(i.key, i.quantity - 1)}
                      aria-label="Diminuer"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">{i.quantity}</span>
                    <button
                      className="flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => void updateQuantity(i.key, i.quantity + 1)}
                      aria-label="Augmenter"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <span className="font-display text-sm font-bold text-foreground">
                    {formatPrice(i.unitPrice * i.quantity)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Récapitulatif collant */}
        <Card className="sticky top-24 p-6">
          <h2 className="font-display text-lg font-bold">Récapitulatif</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="font-medium">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>dont TVA (19,25%)</dt>
              <dd>{formatPrice(estimatedTax)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Livraison</dt>
              <dd>au checkout</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-border pt-4">
            <span className="font-display text-xl font-bold text-primary">{formatPrice(subtotal)}</span>
          </div>
          <Link to="/checkout" className="mt-5 block">
            <Button className="w-full" size="lg">Passer au paiement</Button>
          </Link>
          {!isAuthenticated && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Panier invité — connectez-vous pour le sauvegarder, il sera fusionné.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
