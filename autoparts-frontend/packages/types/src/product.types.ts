// ── Produits, variantes, images, compatibilités ────────────────
import type { ISODate } from './common';

export type ProductCondition = 'new' | 'genuine_used' | 'reconditioned';

export interface ProductImage {
  id: string;
  url: string;
  /** Variantes de taille produites à l'upload (backend : jsonb `sizes`). */
  sizes?: { thumb?: string; medium?: string; large?: string } | null;
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  largeUrl?: string | null;
  isPrimary?: boolean;
  position?: number;
}

export interface ProductVariant {
  id: string;
  variantSku: string;
  attributes: Record<string, string>;
  priceOverride?: number | null;
  costPrice?: number;
  reorderPoint?: number;
  isActive: boolean;
  product?: Product;
}

export interface ProductCompatibility {
  id?: string;
  make: string;
  model: string;
  yearStart?: number | null;
  yearEnd?: number | null;
  engineCode?: string | null;
}

export interface ProductMoq {
  quantity: number;
  unit: string;
  /** Message prêt à afficher (ex. "Quantité minimum : 5 unités — vente par carton"). */
  message?: string;
}

export interface Product {
  id: string;
  sku: string;
  oemReference?: string | null;
  name: string;
  description?: string | null;
  categoryId: string;
  brandId: string;
  basePrice: number;
  currency: string;
  /** Prix ajusté pour le viewer (tier appliqué côté backend). */
  price?: number;
  /** Prix visibles par le viewer, par tier (filtré côté backend). */
  tierPrices?: Record<string, number>;
  moq?: ProductMoq | null;
  minOrderQty?: number | null;
  condition: ProductCondition;
  weightKg?: number | null;
  dimensionsCm?: { length: number; width: number; height: number } | null;
  isActive: boolean;
  orgId?: string | null;
  publicListing?: boolean;
  category?: CategoryRef;
  brand?: BrandRef;
  images?: ProductImage[];
  variants?: ProductVariant[];
  compatibilities?: ProductCompatibility[];
  averageRating?: number | null;
  reviewCount?: number;
  createdAt?: ISODate;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface BrandRef {
  id: string;
  name: string;
  isOem?: boolean;
}

export interface ProductQuery {
  page?: number;
  limit?: number;
  q?: string;
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: ProductCondition;
  make?: string;
  model?: string;
  year?: number;
  inStock?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
}

export interface PriceHistoryPoint {
  date: ISODate;
  price: number;
}
