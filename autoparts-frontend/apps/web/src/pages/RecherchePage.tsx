import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button, Badge } from '@autoparts/ui';
import { searchApi } from '@autoparts/api';
import { useAuthStore } from '@/store/auth.store';
import { useProductSearch } from '@/hooks/useProductSearch';
import { ProductFiltersPanel, SortSelect } from '@/components/catalog/ProductFiltersPanel';
import { ProductGrid, ProductGridSkeleton, ProductsEmpty } from '@/components/catalog/ProductCard';
import { VehicleSearchWizard } from '@/components/search/VehicleSearchWizard';
import { PhotoSearchButton } from '@/components/search/PhotoSearchButton';

export default function RecherchePage() {
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuthStore();

  const q = params.get('q') ?? undefined;
  const make = params.get('make') ?? undefined;
  const model = params.get('model') ?? undefined;
  const year = params.get('year') ? Number(params.get('year')) : undefined;

  const search = useProductSearch({ search: q, make, model, year });

  // Historique serveur (auth) — 10 dernières recherches
  const { data: history = [] } = useQuery({
    queryKey: ['search', 'history'],
    queryFn: searchApi.history,
    enabled: isAuthenticated,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">
            {q ? <>Résultats pour « {q} »</> : make ? <>Pièces pour {make}{model ? ` ${model}` : ''}{year ? ` (${year})` : ''}</> : 'Recherche'}
          </h1>
          <p className="text-sm text-muted-foreground">{search.total} produit(s) trouvé(s).</p>
        </div>
        <VehicleSearchWizard />
        <div className="sm:w-72">
          <PhotoSearchButton />
        </div>
        {isAuthenticated && history.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Récentes :</span>
            {history.map((h, i) => (
              <Badge key={`${h}-${i}`} tone="neutral">
                <a href={`/recherche?q=${encodeURIComponent(typeof h === 'string' ? h : String((h as { query?: string }).query ?? h))}`}>
                  {typeof h === 'string' ? h : String((h as { query?: string }).query ?? '')}
                </a>
              </Badge>
            ))}
            <button
              className="text-xs text-destructive hover:underline"
              onClick={() => void searchApi.clearHistory()}
            >
              <Trash2 strokeWidth={1.5} className="inline h-3 w-3" /> Effacer
            </button>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <ProductFiltersPanel
          filters={search.filters}
          setFilter={search.setFilter}
          reset={search.reset}
          activeCount={search.activeCount}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SortSelect
              value={`${search.filters.sortBy ?? 'createdAt'}:${search.filters.sortDir ?? 'DESC'}`}
              onChange={(v) => {
                search.setFilter('sortBy', v.sortBy);
                search.setFilter('sortDir', v.sortDir);
              }}
            />
            {search.isFetching && <span className="text-xs text-muted-foreground">Actualisation…</span>}
          </div>

          {search.isLoading ? (
            <ProductGridSkeleton />
          ) : search.items.length === 0 ? (
            <ProductsEmpty onReset={search.reset} />
          ) : (
            <>
              <ProductGrid products={search.items} />
              {search.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button variant="outline" size="sm" disabled={search.page <= 1} onClick={() => search.setPage(search.page - 1)}>
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {search.page} / {search.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={search.page >= search.totalPages} onClick={() => search.setPage(search.page + 1)}>
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
