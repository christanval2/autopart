// ── Catalogue : référentiels publics + produits ────────────────
import { api, unwrap, unwrapWithPagination } from './client';
import type { Brand, Category, Product, ProductCondition } from '@autoparts/types';
import type { Pagination } from './client';

export const catalogApi = {
  /** GET /catalog/categories — liste active à plat (front construit l'arbre). */
  async categories(): Promise<Category[]> {
    return unwrap(api.get('/catalog/categories'));
  },
  /** GET /catalog/brands — liste active. */
  async brands(): Promise<Brand[]> {
    return unwrap(api.get('/catalog/brands'));
  },
};

export interface ProductListQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  condition?: ProductCondition;
  minPrice?: number;
  maxPrice?: number;
  make?: string;
  model?: string;
  year?: number;
  inStock?: boolean;
  mine?: boolean;
  sortBy?: 'name' | 'basePrice' | 'createdAt';
  sortDir?: 'ASC' | 'DESC';
}

export interface ProductListResult {
  items: Product[];
  pagination?: Pagination;
}

export const productsApi = {
  async list(query: ProductListQuery = {}): Promise<ProductListResult> {
    return unwrapWithPagination(api.get('/products', { params: query }));
  },

  async byId(id: string): Promise<Product> {
    return unwrap(api.get(`/products/${id}`));
  },
};
