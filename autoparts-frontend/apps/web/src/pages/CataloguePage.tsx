import { useSearchParams } from 'react-router-dom';
import { Button } from '@autoparts/ui';
import {
  useProductSearch,
} from '@/hooks/useProductSearch';
import { ProductFiltersPanel, SortSelect } from '@/components/catalog/ProductFiltersPanel';
import { ProductGrid, ProductGridSkeleton, ProductsEmpty } from '@/components/catalog/ProductCard';

export default function CataloguePage() {
  const [params] = useSearchParams();

  const search = useProductSearch({
    search: params.get('q') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    brandId: params.get('brandId') ?? undefined,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Catalogue</h1>
        <p className="text-sm text-muted-foreground">
          {search.total} produit(s) — pièces neuves, occasion certifiée et reconditionnées.
        </p>
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={search.page <= 1}
                    onClick={() => search.setPage(search.page - 1)}
                  >
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {search.page} / {search.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={search.page >= search.totalPages}
                    onClick={() => search.setPage(search.page + 1)}
                  >
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
