import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, PriceTag, RatingStars, Skeleton } from '@autoparts/ui';
import { productsApi, api, unwrap, wishlistApi, mediaUrl } from '@autoparts/api';
import { PackageSearch } from 'lucide-react';
import type { Product } from '@autoparts/types';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { ProductCard } from '@/components/catalog/ProductCard';
import { ProductReviewsSection } from '@/components/reviews/ProductReviewsSection';
import { ProductQASection } from '@/components/qa/ProductQASection';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Neuf',
  genuine_used: 'Occasion certifiée',
  reconditioned: 'Reconditionné',
};

export default function ProduitPage() {
  const { id } = useParams<{ id: string }>();
  const addOrMerge = useCartStore((s) => s.addOrMerge);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const isAuthenticatedPage = useAuthStore((s) => s.isAuthenticated);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['products', id],
    queryFn: () => productsApi.byId(id!),
    enabled: Boolean(id),
  });

  const { data: rating } = useQuery({
    queryKey: ['reviews', 'rating', id],
    queryFn: () => unwrap<{ average: number; count: number }>(api.get(`/reviews/product/${id}/rating`)),
    enabled: Boolean(id),
  });

  const { data: similar } = useQuery({
    queryKey: ['recommendations', 'similar', id],
    queryFn: () => unwrap<Product[]>(api.get(`/recommendations/similar/${id}`, { params: { limit: 4 } })),
    enabled: Boolean(id),
  });

  const variant = useMemo(
    () => product?.variants?.find((v) => v.id === selectedVariantId) ?? product?.variants?.[0],
    [product, selectedVariantId],
  );

  // Quantité pré-réglée sur le minimum de commande (MOQ org_type) dès
  // chargement : le produit est commandable sans manipuler le stepper.
  useEffect(() => {
    if (product?.minOrderQty && product.minOrderQty > 1) setQuantity(product.minOrderQty);
    else setQuantity(1);
  }, [product?.id, product?.minOrderQty]);

  const addToCart = useMutation({
    mutationFn: async () => {
      if (!variant) throw new Error('Aucune variante disponible');
      await addOrMerge(
        {
          variantId: variant.id,
          productName: product!.name,
          variantSku: variant.variantSku,
          image: product?.images?.[0]?.url ?? null,
          unitPrice: Number(product!.price ?? variant.priceOverride ?? product!.basePrice),
        },
        quantity,
      );
    },
    onSuccess: () => {
      toast.success('Ajouté au panier');
      setDrawerOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isError && !isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon={<PackageSearch strokeWidth={1.5} className="h-10 w-10 text-muted-foreground" />}
          title="Produit indisponible"
          description="Ce produit n'existe plus, a été retiré du catalogue ou n'est pas visible pour votre compte (référence réservée B2B)."
          action={
            <Link to="/catalogue">
              <Button variant="outline">Voir le catalogue</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (isLoading || !product) {
    return (
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-2">
        <Skeleton className="aspect-square rounded-card" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const images = product.images ?? [];
  // Prix applicable à l'appelant (tier de son organisation), calculé backend ;
  // les prix hors tier autorisé ne sont jamais envoyés par l'API.
  const price = Number(product.price ?? variant?.priceOverride ?? product.basePrice);
  const attrs = variant?.attributes ?? {};
  // Règles org_type — MOQ : bloqué inline (pas de toast), bouton désactivé
  const moqQty = product.moq?.quantity ?? 1;
  const belowMoq = quantity < moqQty;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Fil d'ariane */}
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">Accueil</Link> ·{' '}
        <Link to="/catalogue" className="hover:text-primary">Catalogue</Link>
        {product.category && (
          <>
            {' '}·{' '}
            <Link to={`/catalogue/categories/${product.category.slug}`} className="hover:text-primary">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Galerie */}
        <div>
          <div className="aspect-square overflow-hidden rounded-card border border-border bg-muted">
            {images[activeImage] ? (
              <img
                src={mediaUrl(images[activeImage].sizes?.large ?? images[activeImage].largeUrl ?? images[activeImage].url)}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-7xl text-muted-foreground/70">🔧</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(i)}
                  className={`h-16 w-16 overflow-hidden rounded border-2 ${
                    i === activeImage ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <img src={mediaUrl(img.sizes?.thumb ?? img.thumbUrl ?? img.url)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">{CONDITION_LABELS[product.condition] ?? product.condition}</Badge>
            {product.brand && (
              <Link to={`/catalogue/marques/${product.brand.id}`}>
                <Badge tone="primary">{product.brand.name}</Badge>
              </Link>
            )}
            {product.oemReference && <Badge tone="neutral">OEM {product.oemReference}</Badge>}
          </div>

          <h1 className="text-2xl font-bold">{product.name}</h1>

          <div className="flex items-center gap-3">
            <RatingStars value={rating?.average ?? 0} showValue />
            <a href="#avis" className="text-sm text-primary hover:underline">
              {rating?.count ?? 0} avis
            </a>
          </div>

          <PriceTag amount={price} size="lg" />
          <p className="text-xs text-muted-foreground">SKU : {variant?.variantSku ?? product.sku} · Prix TTC, TVA 19,25% incluse</p>

          {/* Règles org_type — quantité minimale de commande (MOQ) */}
          {product.moq && (
            <p className="rounded-input bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
              📦 {product.moq.message}
            </p>
          )}

          {product.description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {product.description}
            </p>
          )}

          {/* Variantes */}
          {(product.variants?.length ?? 0) > 1 && (
            <div>
              <div className="mb-2 text-sm font-semibold">Variantes</div>
              <div className="flex flex-wrap gap-2">
                {product.variants!.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`rounded-input border px-3 py-1.5 text-sm ${
                      variant?.id === v.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input'
                    }`}
                  >
                    {Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(' · ') || v.variantSku}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attributs variante */}
          {Object.keys(attrs).length > 0 && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(attrs).map(([k, v]) => (
                <div key={k} className="rounded-input bg-muted/50 px-3 py-2/50">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Achat */}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-input border border-input">
              <button className="px-3 py-2" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
              <span className="w-10 text-center font-medium">{quantity}</span>
              <button className="px-3 py-2" onClick={() => setQuantity((q) => Math.min(999, q + 1))}>+</button>
            </div>
            <Button
              className="flex-1"
              size="lg"
              loading={addToCart.isPending}
              disabled={!variant || belowMoq}
              onClick={() => addToCart.mutate()}
            >
              Ajouter au panier
            </Button>
          </div>
          {belowMoq && (
            <p className="text-sm text-red-600">
              {product.moq
                ? `La quantité minimale de commande pour ce produit est de ${moqQty} unités${product.moq.unit !== 'unité' ? ` (vente par ${product.moq.unit})` : ''}.`
                : `La quantité minimale de commande est de ${moqQty} unité${moqQty > 1 ? 's' : ''}.`}
            </p>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              if (!isAuthenticatedPage) {
                toast.info('Connectez-vous pour enregistrer vos favoris.');
                return;
              }
              try {
                await wishlistApi.add(product.id);
                toast.success('Ajouté à vos favoris');
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            ♡ Ajouter à mes favoris
          </Button>
          <p className="text-xs text-muted-foreground">
            Stock vérifié en temps réel au moment de la commande.
          </p>
        </div>
      </div>

      {/* Compatibilités véhicule */}
      {(product.compatibilities?.length ?? 0) > 0 && (
        <Card className="mt-10">
          <CardContent>
            <h2 className="mb-3 text-lg font-semibold">Compatibilité véhicule</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Marque</th>
                    <th className="py-2 pr-4">Modèle</th>
                    <th className="py-2 pr-4">Années</th>
                    <th className="py-2">Moteur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border ">
                  {product.compatibilities!.map((c, i) => (
                    <tr key={c.id ?? i}>
                      <td className="py-2 pr-4 font-medium">{c.make}</td>
                      <td className="py-2 pr-4">{c.model}</td>
                      <td className="py-2 pr-4">
                        {c.yearStart ?? '?'} – {c.yearEnd ?? '?'}
                      </td>
                      <td className="py-2">{c.engineCode ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Q&A produits (V3) */}
      <div id="qa" className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Questions / Réponses</h2>
        <ProductQASection productId={product.id} />
      </div>

      {/* Avis vérifiés */}
      <div id="avis" className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Avis clients</h2>
        <ProductReviewsSection productId={product.id} />
      </div>

      {/* Similaires */}
      {similar && similar.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">Produits similaires</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {similar.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
