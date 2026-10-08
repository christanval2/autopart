// ── Administration : litiges, commissions, stock, audit, stats ─
import type { ISODate } from './common';
import type { User } from './user.types';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_buyer'
  | 'resolved_seller'
  | 'closed';

export type DisputeType = 'not_received' | 'wrong_item' | 'quality' | 'payment' | 'other';

export interface Dispute {
  id: string;
  orderId: string;
  type: DisputeType;
  reason?: string;
  description?: string;
  status: DisputeStatus;
  resolution?: string | null;
  openedById?: string;
  createdAt?: ISODate;
}

export type CommissionStatus = 'pending' | 'validated' | 'paid' | 'cancelled';

export interface Commission {
  id: string;
  orderId?: string;
  sellerOrgId?: string;
  rate?: number;
  amount: number;
  status: CommissionStatus;
  createdAt?: ISODate;
}

export interface CommissionSummary {
  totalPending?: number;
  totalValidated?: number;
  totalPaid?: number;
  [key: string]: unknown;
}

// ── Stock ──────────────────────────────────────────────────────
export interface Warehouse {
  id: string;
  name: string;
  location?: string | null;
  orgId?: string | null;
}

export interface StockLevel {
  id: string;
  warehouseId: string;
  warehouse?: Warehouse;
  variantId: string;
  variant?: { id: string; variantSku: string; product?: { id: string; name: string } };
  qtyOnHand: number;
  qtyReserved: number;
  reorderPoint?: number;
}

export interface StockAlert extends StockLevel {
  shortage?: number;
}

export interface StockMovement {
  id: string;
  variantId: string;
  warehouseId: string;
  reason: string;
  delta: number;
  qtyBefore?: number;
  qtyAfter?: number;
  userId?: string | null;
  createdAt?: ISODate;
}

// ── Analytics ──────────────────────────────────────────────────
/** Ligne brute de GET /analytics/products/top|slow (clés SQL réelles). */
export interface TopProduct {
  productId: string;
  name?: string;
  sku?: string;
  totalQty?: number | string;
  totalRevenue?: number | string;
  orderCount?: number | string;
}

export interface RevenueByCategory {
  categoryId: string;
  categoryName?: string;
  revenue: number;
}

export interface TimelinePoint {
  period: string;
  revenue: number;
  orders?: number;
}

/** Vraie forme de GET /analytics/conversion (compteurs en string côté SQL). */
export interface ConversionStats {
  searches: { totalSearches: number | string; avgResults: number | string };
  orders: { totalOrders: number | string };
  reviews: { avgRating: number | string; totalReviews: number | string };
}

export interface PlatformStats {
  gmv?: number;
  activeUsers?: number;
  newOrganizations?: number;
  paymentSuccessRate?: number;
  ordersByStatus?: Record<string, number>;
  alerts?: { blockedOrders?: number; pendingPayments?: number };
  [key: string]: unknown;
}

// ── Fiscalité ──────────────────────────────────────────────────
export const TVA_RATE_CM = 19.25;

export interface TaxConfig {
  id: string;
  country: string;
  rate: number;
  appliesToB2B?: boolean;
  isActive?: boolean;
}

export interface InvoicePreview {
  orderNumber?: string;
  totalAmount?: number;
  taxAmount?: number;
  [key: string]: unknown;
}

// ── Référentiels admin ─────────────────────────────────────────
export interface AdminUserRow extends Omit<User, 'org'> {
  org?: { id: string; name: string } | null;
}

export interface Carrier {
  id: string;
  name: string;
  trackingUrlTemplate?: string | null;
  isActive?: boolean;
}
