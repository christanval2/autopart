// ── Carte produit + grille réutilisable (style Dribbble) ───────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, PriceTag, Skeleton, EmptyState, Button } from '@autoparts/ui';
import { wishlistApi, mediaUrl } from '@autoparts/api';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import type { Product } from '@autoparts/types';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Neuf',
  genuine_used: 'Occasion certifiée',
  reconditioned: 'Reconditionné',
};

const CONDITION_TONES: Record<string, 'success' | 'accent' | 'info'> = {
  new: 'success',
  genuine_used: 'accent',
  reconditioned: 'info',
};

/** Cœur favori : API si connecté, sinon invitation à se connecter. */
function WishHeart({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState(false);

  return (
    <button
      aria-label="Ajouter aux favoris"
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 shadow-card backdrop-blur transition-all hover:scale-110"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAuthenticated) {
          toast.info('Connectez-vous pour sauvegarder vos favoris.');
          return;
        }
        if (liked) return;
        setBusy(true);
        try {
          await wishlistApi.add(productId);
          setLiked(true);
          toast.success('Ajouté à vos favoris');
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy || liked}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <Heart
          className={liked ? 'h-4 w-4 fill-accent text-accent' : 'h-4 w-4 text-muted-foreground'}
          strokeWidth={1.5}
        />
      )}
    </button>
  );
}

/** Ajout express au panier depuis la carte (1re variante, au MOQ du produit). */
function QuickAdd({ product }: { product: Product }) {
  const addOrMerge = useCartStore((s) => s.addOrMerge);
  const [busy, setBusy] = useState(false);
  const variant = product.variants?.[0];
  // Règles org_type : l'ajout express respecte le MOQ (panier bloqué en dessous)
  const qty = product.moq?.quantity ?? 1;

  return (
    <Button
      size="sm"
      className="absolute inset-x-2 bottom-2 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
      disabled={!variant || busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!variant) return;
        setBusy(true);
        try {
          await addOrMerge(
            {
              variantId: variant.id,
              productName: product.name,
              variantSku: variant.variantSku,
              image: product.images?.[0]?.url ?? null,
              unitPrice: Number(product.price ?? variant.priceOverride ?? product.basePrice),
            },
            qty,
          );
          toast.success(qty > 1 ? `Ajouté au panier (${qty} unités — ${product.moq?.unit})` : 'Ajouté au panier');
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={1.5} />}
      Ajouter
    </Button>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];
  const variant = product.variants?.[0];
  // Prix applicable à l'appelant (tier de son organisation), calculé backend
  const price = product.price ?? variant?.priceOverride ?? product.basePrice;

  return (
    <Link
      to={`/produits/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {image ? (
          <img
            src={mediaUrl(image.sizes?.medium ?? image.mediumUrl ?? image.url)}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-muted-foreground/70">🔧</div>
        )}
        {product.condition && (
          <Badge tone={CONDITION_TONES[product.condition] ?? 'neutral'} className="absolute left-2 top-2 shadow-card">
            {CONDITION_LABELS[product.condition] ?? product.condition}
          </Badge>
        )}
        <WishHeart productId={product.id} />
        {variant && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
            <QuickAdd product={product} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="truncate">{product.brand?.name}</span>
          {product.category?.name && (
            <>
              <span className="opacity-40">·</span>
              <span className="truncate">{product.category.name}</span>
            </>
          )}
        </div>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-foreground">
          {product.name}
        </h3>
        <div className="text-xs text-muted-foreground">Réf : {product.oemReference ?? product.sku}</div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <PriceTag amount={price} size="sm" />
          {product.condition === 'genuine_used' && (
            <span className="text-[10px] font-medium text-muted-foreground">Occasion</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ProductsEmpty({ onReset }: { onReset?: () => void }) {
  return (
    <EmptyState
      title="Aucun produit trouvé"
      description="Essayez d'élargir vos filtres ou utilisez la recherche par véhicule."
      action={onReset ? <Button variant="outline" onClick={onReset}>Réinitialiser les filtres</Button> : undefined}
    />
  );
}
