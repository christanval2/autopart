import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '@autoparts/api';
import { Skeleton, Button, EmptyState } from '@autoparts/ui';
import { useProductSearch } from '@/hooks/useProductSearch';
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel';
import { ProductGrid, ProductGridSkeleton } from '@/components/catalog/ProductCard';

export default function CategoriePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: catalogApi.categories,
  });

  const category = categories.find((c) => c.slug === slug);
  const children = categories.filter((c) => c.parentId === category?.id);

  const search = useProductSearch(
    { categoryId: category?.id },
    1,
  );

  // Synchronise le filtre quand la catégorie (slug URL) change
  if (category && search.filters.categoryId !== category.id && !catLoading) {
    search.setFilter('categoryId', category.id);
  }

  if (catLoading) return <div className="mx-auto max-w-7xl px-4 py-8"><Skeleton className="h-8 w-64" /></div>;

  if (!category) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <EmptyState
          title="Catégorie introuvable"
          action={<Link to="/catalogue"><Button>Retour au catalogue</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{category.name}</h1>
        <p className="text-sm text-muted-foreground">{search.total} produit(s) dans cette catégorie.</p>
        {children.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-xs ${
                !search.filters.categoryId || search.filters.categoryId === category.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground'
              }`}
              onClick={() => search.setFilter('categoryId', category.id)}
            >
              Toutes
            </button>
            {children.map((c) => (
              <button
                key={c.id}
                className={`rounded-full border px-3 py-1 text-xs ${
                  search.filters.categoryId === c.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground'
                }`}
                onClick={() => search.setFilter('categoryId', c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <ProductFiltersPanel
          filters={search.filters}
          setFilter={search.setFilter}
          reset={() => {
            search.reset();
            search.setFilter('categoryId', category.id);
          }}
          activeCount={search.activeCount}
        />
        <div>
          {search.isLoading ? <ProductGridSkeleton /> : (
            <ProductGrid products={search.items} />
          )}
        </div>
      </div>
    </div>
  );
}
