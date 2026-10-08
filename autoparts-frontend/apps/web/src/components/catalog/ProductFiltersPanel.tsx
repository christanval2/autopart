// ── Panneau de filtres produits (catalogue / recherche) ────────
import { useQuery } from '@tanstack/react-query';
import { Select, Switch, Button, CategoryTree } from '@autoparts/ui';
import { catalogApi } from '@autoparts/api';
import { buildCategoryTree } from '@autoparts/ui';
import type { Filters } from '@/hooks/useProductSearch';

export function ProductFiltersPanel({
  filters,
  setFilter,
  reset,
  activeCount,
}: {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  reset: () => void;
  activeCount: number;
}) {
  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: catalogApi.categories,
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['catalog', 'brands'],
    queryFn: catalogApi.brands,
  });

  return (
    <aside className="space-y-5 rounded-card border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filtres {activeCount > 0 && `(${activeCount})`}</h3>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>Réinitialiser</Button>
        )}
      </div>

      {/* Catégories */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catégorie</div>
        <CategoryTree
          categories={categories}
          selectedId={filters.categoryId}
          onSelect={(c) => setFilter('categoryId', c.id === filters.categoryId ? undefined : c.id)}
        />
      </div>

      {/* Marques */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marque</div>
        <Select
          value={filters.brandId ?? ''}
          onChange={(e) => setFilter('brandId', e.target.value || undefined)}
        >
          <option value="">Toutes les marques</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}{b.isOem ? ' (OEM)' : ''}
            </option>
          ))}
        </Select>
      </div>

      {/* Prix */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prix (FCFA)</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min"
            className="w-full rounded-input border border-input px-2 py-1.5 text-sm"
            defaultValue={filters.minPrice}
            onBlur={(e) => setFilter('minPrice', e.target.value ? Number(e.target.value) : undefined)}
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            className="w-full rounded-input border border-input px-2 py-1.5 text-sm"
            defaultValue={filters.maxPrice}
            onBlur={(e) => setFilter('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </div>

      {/* Condition */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">État</div>
        <Select
          value={filters.condition ?? ''}
          onChange={(e) =>
            setFilter('condition', (e.target.value || undefined) as Filters['condition'])
          }
        >
          <option value="">Tous</option>
          <option value="new">Neuf</option>
          <option value="genuine_used">Occasion certifiée</option>
          <option value="reconditioned">Reconditionné</option>
        </Select>
      </div>

      <Switch
        checked={Boolean(filters.inStock)}
        onChange={(v) => setFilter('inStock', v || undefined)}
        label="En stock uniquement"
      />
    </aside>
  );
}

export function SortSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: { sortBy?: Filters['sortBy']; sortDir?: Filters['sortDir'] }) => void;
}) {
  return (
    <Select
      className="w-56"
      value={value}
      onChange={(e) => {
        const [sortBy, sortDir] = e.target.value.split(':');
        onChange({ sortBy: sortBy as Filters['sortBy'], sortDir: sortDir as Filters['sortDir'] });
      }}
    >
      <option value="createdAt:DESC">Plus récents</option>
      <option value="basePrice:ASC">Prix croissant</option>
      <option value="basePrice:DESC">Prix décroissant</option>
      <option value="name:ASC">Nom (A-Z)</option>
    </Select>
  );
}
