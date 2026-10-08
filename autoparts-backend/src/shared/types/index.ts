// ─── Augmentation Express.Request ────────────────────────────
import 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augmentation Express.Request standard
  namespace Express {
    interface Request {
      user?:      AuthUser;
      requestId?: string;
    }
  }
}

// ─── Rôles & Enums ────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'org_admin'
  | 'seller'
  | 'buyer'
  | 'logistics'
  | 'accountant';

export interface AuthUser {
  id:    string;
  orgId: string | null;
  roles: UserRole[];
  email: string;
  // F1b — présent uniquement en session d'impersonation
  impersonatorId?: string;
}

export type OrgType         = 'importer' | 'wholesaler' | 'retailer' | 'garage';
export type OrderStatus     = 'draft' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
export type OrderChannel    = 'b2b' | 'b2c' | 'marketplace';
export type PaymentMethod   = 'mobile_money' | 'bank_transfer' | 'cash' | 'credit' | 'card';
export type PaymentStatus   = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type ShipmentStatus  = 'preparing' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned';
export type ProductCondition= 'new' | 'genuine_used' | 'reconditioned';
export type CatalogVisibility='public' | 'private' | 'b2b_only';
export type NotificationType= 'order_update' | 'stock_alert' | 'payment' | 'promo' | 'system';
export type AccountType     = 'individual' | 'pro' | 'admin';
