// ── Utilisateurs, organisations, tiers ─────────────────────────
import type { ISODate } from './common';

export type UserRole =
  | 'super_admin'
  | 'org_admin'
  | 'seller'
  | 'buyer'
  | 'logistics';

export type AccountType = 'individual' | 'pro' | 'admin';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  accountType: AccountType;
  roles: UserRole[];
  orgId?: string | null;
  // Règles org_type — résumé de l'organisation renvoyé par /auth/me.
  // Sert à l'affichage (états vendeur/acheteur, MOQ) ; les droits
  // réels sont vérifiés côté backend.
  org?: UserOrgSummary | null;
  isVerified: boolean;
  isActive: boolean;
  smsOptOut?: boolean;
  marketingOptOut?: boolean;
  lastLoginAt?: ISODate | null;
  createdAt?: ISODate;
}

export interface UserOrgSummary {
  id: string;
  name: string;
  orgType: OrgType;
  /** Peut lister des produits à la vente (dérivé de org_type, activable par un admin). */
  canSell: boolean;
  isVerified?: boolean;
  creditLimit?: number;
  tier?: { id: string; name: string; discountRate: number } | null;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface Address {
  id: string;
  label?: string | null;
  /** Rue/voie — colonne `street` côté backend (pas « line1 »). */
  street: string;
  city: string;
  postalCode?: string | null;
  countryCode?: string;
  isDefault?: boolean;
  userId?: string;
}

export type OrgType = 'importer' | 'wholesaler' | 'retailer' | 'garage';

export interface Organization {
  id: string;
  name: string;
  orgType: OrgType;
  /** Capacité de vendre (importer/wholesaler par défaut, activable par un admin pour retailer/garage). */
  canSell?: boolean;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  countryCode: string;
  parentOrgId?: string | null;
  isVerified: boolean;
  creditLimit: number;
  performanceScore?: number | null;
  approvalThreshold?: number | null;
  tierId?: string | null;
  createdAt?: ISODate;
}

// ── KYB : documents de vérification d'une organisation ─────────
export type OrgDocumentType = 'rccm' | 'patente' | 'statuts' | 'id_card';
export type OrgDocumentStatus = 'pending' | 'approved' | 'rejected';

export interface OrgDocument {
  id: string;
  type: OrgDocumentType;
  fileUrl?: string;
  originalName?: string | null;
  uploadedBy?: string | null;
  status: OrgDocumentStatus;
  reviewedBy?: string | null;
  reviewedAt?: ISODate | null;
  rejectionReason?: string | null;
  createdAt?: ISODate;
  org?: Organization;
}

export interface OrgTier {
  id: string;
  name: string;
  discountRate: number;
  minOrderQty: number;
  minOrderValue: number;
  canBuyWholesale: boolean;
  canSell: boolean;
}

export interface OrgMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  isActive: boolean;
}

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: ISODate;
}
