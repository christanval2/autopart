// ── Drawer panier latéral persistant (shadcn-style) ────────────
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { Drawer, Button, EmptyState, PriceTag, Skeleton } from '@autoparts/ui';
import { mediaUrl } from '@autoparts/api';
import {
  useCartStore,
  selectCartItems,
  selectCartCount,
  selectCartSubtotal,
} from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { formatPrice } from '@autoparts/utils';

export function CartDrawer() {
  const open = useCartStore((s) => s.drawerOpen);
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const loading = useCartStore((s) => s.loading);
  const serverItems = useCartStore(selectCartItems);
  const guestItems = useCartStore((s) => s.guestItems);
  const count = useCartStore(selectCartCount);
  const subtotal = useCartStore(selectCartSubtotal);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const { isAuthenticated } = useAuthStore();

  const items = isAuthenticated
    ? serverItems.map((i) => ({
        key: i.id,
        variantId: i.variantId,
        name: i.productName ?? i.variantSku ?? 'Article',
        sku: i.variantSku ?? '',
        image: i.image,
        quantity: i.quantity,
        unitPrice: i.currentPrice,
        moq: i.moq,
      }))
    : guestItems.map((i) => ({
        key: i.variantId,
        variantId: i.variantId,
        name: i.productName,
        sku: i.variantSku,
        image: i.image,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        moq: undefined,
      }));

  return (
    <Drawer open={open} onClose={() => setOpen(false)} title={`Panier (${count})`}>
      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-16 w-16 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" strokeWidth={1.5} />}
          title="Votre panier est vide"
          description="Parcourez le catalogue pour trouver vos pièces."
          action={
            <Button onClick={() => { setOpen(false); window.location.href = '/catalogue'; }}>
              Voir le catalogue
            </Button>
          }
        />
      ) : (
        <div className="flex h-full flex-col">
          <ul className="flex-1 divide-y divide-border">
            {items.map((i) => (
              <li key={i.key} className="flex gap-3 py-4 first:pt-0">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {i.image ? (
                    <img src={mediaUrl(i.image)} alt={i.name} className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBag className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{i.sku}</div>
                  {/* Règles org_type : rappel du MOQ (vente par palette/carton) */}
                  {i.moq && (
                    <div className="mt-0.5 text-[11px] font-medium text-primary">📦 {i.moq.message}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* Stepper compact : bordure input + boutons ghost */}
                    <div className="inline-flex h-8 items-center rounded-md border border-input">
                      <button
                        className="inline-flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                        disabled={i.quantity <= 1}
                        onClick={() => void updateQuantity(i.key, i.quantity - 1)}
                        aria-label="Diminuer"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums">{i.quantity}</span>
                      <button
                        className="inline-flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => void updateQuantity(i.key, i.quantity + 1)}
                        aria-label="Augmenter"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                    <PriceTag amount={i.unitPrice * i.quantity} size="sm" />
                  </div>
                </div>
                <button
                  className="self-start text-xs text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => void removeItem(i.key)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-auto space-y-3 border-t border-border pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Sous-total estimé</span>
              <span className="font-display text-lg font-bold text-primary">{formatPrice(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              TVA 19,25% et livraison calculées au checkout.
            </p>
            <Link to="/panier" onClick={() => setOpen(false)} className="block">
              <Button variant="outline" className="w-full">Voir le panier</Button>
            </Link>
            <Link to="/checkout" onClick={() => setOpen(false)} className="block">
              <Button className="w-full">Commander</Button>
            </Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}
