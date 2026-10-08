import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '@autoparts/api';
import { Skeleton, Button, EmptyState } from '@autoparts/ui';
import { useProductSearch } from '@/hooks/useProductSearch';
import { ProductFiltersPanel } from '@/components/catalog/ProductFiltersPanel';
import { ProductGrid, ProductGridSkeleton } from '@/components/catalog/ProductCard';

/**
 * NB : l'entité Brand n'a pas de champ slug côté backend — le paramètre
 * d'URL contient donc l'identifiant de marque (UUID).
 */
export default function MarquePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: brands = [], isLoading: brandsLoading } = useQuery({
    queryKey: ['catalog', 'brands'],
    queryFn: catalogApi.brands,
  });

  const brand = brands.find((b) => b.id === slug);

  const search = useProductSearch({ brandId: brand?.id }, 1);
  if (brand && search.filters.brandId !== brand.id) {
    search.setFilter('brandId', brand.id);
  }

  if (brandsLoading) return <div className="mx-auto max-w-7xl px-4 py-8"><Skeleton className="h-8 w-64" /></div>;

  if (!brand) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <EmptyState
          title="Marque introuvable"
          action={<Link to="/catalogue"><Button>Retour au catalogue</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          {brand.name}
          {brand.isOem && (
            <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              OEM
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">{search.total} produit(s) de la marque {brand.name}.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <ProductFiltersPanel
          filters={search.filters}
          setFilter={search.setFilter}
          reset={() => {
            search.reset();
            search.setFilter('brandId', brand.id);
          }}
          activeCount={search.activeCount}
        />
        <div>
          {search.isLoading ? <ProductGridSkeleton /> : <ProductGrid products={search.items} />}
        </div>
      </div>
    </div>
  );
}
