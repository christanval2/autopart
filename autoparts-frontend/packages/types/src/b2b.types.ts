// ── B2B : catalogues, devis, bons de commande, prix négociés ───
import type { ISODate } from './common';
import type { ProductVariant } from './product.types';

export type CatalogVisibility = 'public' | 'b2b_only' | 'private';

export interface Catalog {
  id: string;
  name: string;
  description?: string | null;
  visibility: CatalogVisibility;
  markupPercent?: number | null;
  validFrom?: ISODate | null;
  validUntil?: ISODate | null;
  isActive?: boolean;
  orgId?: string;
}

export interface CatalogProduct {
  id: string;
  catalogId: string;
  variantId: string;
  variant?: ProductVariant;
  discountPercent?: number | null;
  fixedPrice?: number | null;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface QuoteItem {
  id?: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  id: string;
  /** Référence backend : quoteNumber (ex. QUO-202610-12345). */
  reference?: string;
  quoteNumber?: string;
  status: QuoteStatus;
  buyerId?: string;
  sellerOrgId?: string;
  /** Lignes du devis — colonne jsonb `lines` côté backend. */
  items?: QuoteItem[];
  lines?: QuoteItem[];
  subtotal?: number;
  totalAmount?: number;
  discountPct?: number;
  validUntil?: ISODate | null;
  createdAt?: ISODate;
}

export interface PurchaseOrderItem {
  variantId: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived?: number;
  unitCost: number;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'confirmed' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  /** Référence backend : poNumber (ex. PO-XXXXXX). */
  poNumber?: string;
  reference?: string;
  supplierName?: string;
  supplierId?: string;
  status?: PurchaseOrderStatus;
  /** Lignes du bon — colonne jsonb `lines` côté backend. */
  lines?: PurchaseOrderItem[];
  items?: PurchaseOrderItem[];
  totalAmount?: number;
  totalCost?: number;
  createdAt?: ISODate;
}

export interface PriceContract {
  id: string;
  buyerOrgId?: string;
  sellerOrgId?: string;
  /** L'API sérialise la relation variant (objet) plutôt que variant_id. */
  variant?: { id: string; variantSku: string };
  variantId?: string;
  contractPrice: number;
  minQty?: number;
  maxQty?: number;
  currency?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
  createdAt?: string;
}
