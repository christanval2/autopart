// ── Accueil — vitrine moderne (inspiration Dribbble) ───────────
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search, Truck, ShieldCheck, Banknote, Store, Wrench } from 'lucide-react';
import { api, unwrap, productsApi, catalogApi } from '@autoparts/api';
import { buildCategoryTree } from '@autoparts/ui';
import type { Product } from '@autoparts/types';
import { ProductGrid, ProductGridSkeleton } from '@/components/catalog/ProductCard';
import { NearbySellers } from '@/components/geo/NearbySellers';

export default function HomePage() {
  const navigate = useNavigate();

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: catalogApi.categories,
  });
  const tree = buildCategoryTree(categories).slice(0, 8);

  const { data: popular, isLoading: popularLoading } = useQuery({
    queryKey: ['recommendations', 'popular', 8],
    queryFn: () => unwrap<Product[]>(api.get('/recommendations/popular', { params: { limit: 8 } })),
  });

  const { data: latest } = useQuery({
    queryKey: ['products', 'latest', 8],
    queryFn: () => productsApi.list({ limit: 8, sortBy: 'createdAt', sortDir: 'DESC' }),
  });

  return (
    <div>
      {/* ── Hero ── */}
      <section className="border-b border-border bg-muted/40">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-accent">
              B2B &amp; B2C — pièces auto au Cameroun
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
              La bonne pièce auto,
              <br />
              <span className="text-accent">partout au Cameroun</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              Recherchez par référence OEM ou par véhicule. Livraison express à
              Douala et Yaoundé, paiement mobile ou virement.
            </p>

            {/* Recherche */}
            <form
              className="mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-input bg-card p-1.5 shadow-card transition-shadow focus-within:ring-2 focus-within:ring-ring/30"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get('q');
                navigate(`/recherche?q=${encodeURIComponent(String(q ?? ''))}`);
              }}
            >
              <input
                name="q"
                placeholder="Référence OEM, SKU ou nom de pièce…"
                className="flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
                <Search className="h-4 w-4" strokeWidth={1.5} /> Rechercher
              </button>
            </form>

            {/* Mini trust */}
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Truck strokeWidth={1.5} className="h-3.5 w-3.5 text-primary" /> Livraison 24-48 h
              </span>
              <span className="flex items-center gap-1.5">
                <Banknote strokeWidth={1.5} className="h-3.5 w-3.5 text-primary" /> MoMo &amp; Orange Money
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck strokeWidth={1.5} className="h-3.5 w-3.5 text-primary" /> Pièces garanties
              </span>
            </div>
          </div>

          {/* Panneau visuel */}
          <div className="relative hidden lg:block">
            <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute -bottom-8 -left-8 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative ml-auto w-full max-w-md space-y-4">
              <div className="rounded-3xl border border-border bg-card p-6 shadow-card-hover">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wrench strokeWidth={1.5} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">+500 références</div>
                    <div className="text-xs text-muted-foreground">pièces neuves &amp; occasions certifiées</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {['Plaquettes', 'Disques', 'Filtres', 'Amortisseurs'].map((c) => (
                    <div key={c} className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs font-medium text-foreground">
                      {c}
                    </div>
                  ))}
                </div>
              </div>
              <div className="ml-auto w-4/5 rounded-3xl border border-border bg-card p-5 shadow-card-hover">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
                    <Truck strokeWidth={1.5} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Livraison 24-48 h</div>
                    <div className="text-xs text-muted-foreground">Douala · Yaoundé · national</div>
                  </div>
                </div>
              </div>
              <div className="ml-8 w-3/4 rounded-3xl border border-border bg-card p-5 shadow-card-hover">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Banknote strokeWidth={1.5} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">MTN MoMo &amp; Orange</div>
                    <div className="text-xs text-muted-foreground">paiement mobile sécurisé</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Catégories populaires ── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">Catégories populaires</h2>
            <p className="text-sm text-muted-foreground">Les familles de pièces les plus demandées</p>
          </div>
          <Link to="/catalogue" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Tout voir <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {tree.map((c) => (
            <Link
              key={c.id}
              to={`/catalogue/categories/${c.slug}`}
              className="group rounded-2xl border border-border bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover"
            >
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Wrench strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <span className="mt-2.5 block line-clamp-2 text-xs font-medium text-foreground">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Bandeau promo + vendeurs proches ── */}
      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-12 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-dark p-8 text-primary-foreground lg:col-span-2">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-10 right-16 h-32 w-32 rounded-full bg-white/5" />
          <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Offre du moment</span>
          <h3 className="mt-2 font-display text-2xl font-bold">Livraison offerte dès 100 000 FCFA d'achat</h3>
          <p className="mt-1 max-w-md text-sm opacity-90">Sur toutes les commandes livrées à Douala et Yaoundé.</p>
          <Link
            to="/catalogue"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-white/25"
          >
            Profiter de l'offre <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
        <NearbySellers />
      </section>

      {/* ── Populaires ── */}
      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">Les plus populaires</h2>
            <p className="text-sm text-muted-foreground">Les pièces les plus demandées cette période</p>
          </div>
          <Link to="/catalogue" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Tout voir <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
        {popularLoading ? (
          <ProductGridSkeleton />
        ) : popular && popular.length > 0 ? (
          <ProductGrid products={popular} />
        ) : (
          <ProductGridSkeleton />
        )}
      </section>

      {/* ── Bandeau vendeurs ── */}
      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-card sm:p-10">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-accent/10 blur-2xl" />
          <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                <Store strokeWidth={1.5} className="h-3.5 w-3.5" /> Vous êtes vendeur ?
              </span>
              <h3 className="mt-2 font-display text-2xl font-bold">
                Importateurs, grossistes, garages : vendez vos pièces sur AutoParts
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Catalogue B2B, devis, gestion de stock multi-entrepôts et paiements sécurisés.
              </p>
            </div>
            <Link
              to="/auth/inscription"
              className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Devenir vendeur <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Nouveautés ── */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">Nouveautés</h2>
            <p className="text-sm text-muted-foreground">Les dernières pièces ajoutées au catalogue</p>
          </div>
          <Link to="/catalogue" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Tout voir <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
        {latest?.items?.length ? (
          <ProductGrid products={latest.items} />
        ) : (
          <ProductGridSkeleton />
        )}
      </section>
    </div>
  );
}
