// ── Hook de recherche produits partagé (catalogue + recherche) ──
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { productsApi, type ProductListQuery } from '@autoparts/api';

export interface Filters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  condition?: 'new' | 'genuine_used' | 'reconditioned';
  minPrice?: number;
  maxPrice?: number;
  make?: string;
  model?: string;
  year?: number;
  inStock?: boolean;
  sortBy?: 'name' | 'basePrice' | 'createdAt';
  sortDir?: 'ASC' | 'DESC';
}

export function useProductSearch(initial: Filters = {}, initialPage = 1) {
  const [filters, setFilters] = useState<Filters>(initial);
  const [page, setPage] = useState(initialPage);
  const limit = 20;

  const query: ProductListQuery = useMemo(
    () => ({ ...filters, page, limit }),
    [filters, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', query],
    queryFn: () => productsApi.list(query),
    placeholderData: keepPreviousData,
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const reset = () => {
    setFilters({});
    setPage(1);
  };

  const activeCount = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== '' && v !== null,
  ).length;

  return {
    filters,
    setFilter,
    reset,
    activeCount,
    page,
    setPage,
    limit,
    items: data?.items ?? [],
    total: data?.pagination?.total ?? 0,
    totalPages: data?.pagination ? Math.max(1, Math.ceil(data.pagination.total / limit)) : 1,
    isLoading,
    isFetching,
  };
}
