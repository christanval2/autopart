// ── Panier, commandes, livraisons ──────────────────────────────
import type { ISODate } from './common';
import type { Address } from './user.types';
import type { ProductVariant } from './product.types';

// ── Panier (forme exacte du GET /cart détaillé) ────────────────
export interface CartItemDetailed {
  id: string;
  variantId: string;
  productName?: string;
  variantSku?: string;
  image?: string | null;
  quantity: number;
  priceAtAdd: number;
  currentPrice: number;
  available: number;
  // Règles org_type — MOQ du produit (vente par palette/carton/unité)
  moq?: { quantity: number; unit: string; message: string } | null;
  issues: string[];
}

export interface CartDetailed {
  cartId: string;
  items: CartItemDetailed[];
  totalEstimated: number;
  hasIssues: boolean;
}

// ── Commandes ──────────────────────────────────────────────────
export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type OrderChannel = 'b2b' | 'b2c' | 'marketplace';

export interface OrderLine {
  id: string;
  variantId?: string;
  productSnapshot: Record<string, unknown>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxRate: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  notes?: string | null;
  poNumber?: string | null;
  buyerId?: string;
  sellerOrgId?: string;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  lines?: OrderLine[];
  /** Expéditions de la commande (incluses par GET /orders/:id). */
  shipments?: Shipment[];
  /** Date de commande réelle (colonne ordered_at, utilisée par les analytics). */
  orderedAt?: ISODate;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface CreateOrderLineDto {
  variantId: string;
  quantity: number;
}

export interface CreateOrderDto {
  sellerOrgId?: string;
  channel: OrderChannel;
  billingAddressId?: string;
  shippingAddressId?: string;
  lines: CreateOrderLineDto[];
  currency?: string;
  note?: string;
}

/** Vraie forme de GET /orders/stats (scopée à l'organisation vendeuse). */
export interface OrderStats {
  totals: { count: number | string; revenue: number | string | null; avgOrder: number | string | null };
  byChannel: Array<{ channel: string; count: number | string; revenue: number | string }>;
  byStatus: Array<{ status: OrderStatus; count: number | string }>;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface OrderApproval {
  id: string;
  orderId: string;
  status: ApprovalStatus;
  reason?: string | null;
  approverId?: string | null;
  createdAt?: ISODate;
  order?: Order;
}

// ── Expéditions ────────────────────────────────────────────────
export type ShipmentStatus =
  | 'preparing'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned';

export interface ShipmentWarehouseRef {
  id: string;
  name: string;
  city: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  status: ShipmentStatus;
  shippedAt?: ISODate | null;
  deliveredAt?: ISODate | null;
  pickupCode?: string | null;
  order?: Order;
  /** Entrepôt d'origine (inclus par GET /shipments) — sert au trajet carte. */
  warehouse?: ShipmentWarehouseRef | null;
  parcelInfo?: { weightKg?: number; dimensions?: string; nbColis?: number } | null;
}

/** Réponse enrichie de GET /shipments/track/:number (trajet public). */
export interface TrackedShipment extends Shipment {
  originCity?: string | null;
  originWarehouse?: string | null;
  destinationCity?: string | null;
  destinationLabel?: string | null;
  /** Progression estimée origine → destination (0→1) selon le statut. */
  progress?: number;
}

export interface TrackingEvent {
  status: ShipmentStatus;
  date?: ISODate | null;
  carrier?: string | null;
  trackingNumber?: string | null;
}

export interface ShippingZone {
  id: string;
  name: string;
  type: 'city' | 'national' | 'international';
  baseFee?: number;
  perKgFee?: number;
  freeThreshold?: number;
  etaDays?: number;
  isActive?: boolean;
}
