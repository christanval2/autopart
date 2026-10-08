// ── Avis, wishlist, fidélité, Q&A ──────────────────────────────
import type { ISODate } from './common';
import type { User } from './user.types';

export interface Review {
  id: string;
  productId: string;
  userId: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  rating: number;
  comment?: string | null;
  isVerifiedPurchase: boolean;
  status: 'approved' | 'pending' | 'rejected';
  sellerReply?: string | null;
  sellerRepliedAt?: ISODate | null;
  createdAt?: ISODate;
}

export interface ProductRating {
  average: number;
  count: number;
  distribution?: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface WishlistItem {
  id?: string;
  productId: string;
  product?: { id: string; name: string; basePrice: number; images?: { url: string }[] };
  addedAt?: ISODate;
}

export interface LoyaltyBalance {
  points: number;
  tier?: string;
}

export interface LoyaltyTransaction {
  id: string;
  type: 'earned' | 'redeemed' | 'expired' | 'bonus' | 'adjustment';
  points: number;
  description?: string;
  createdAt?: ISODate;
}

export interface ProductQuestion {
  id: string;
  productId: string;
  userId: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  question: string;
  answer?: string | null;
  answeredById?: string | null;
  answeredAt?: ISODate | null;
  isVisible?: boolean;
  createdAt?: ISODate;
}
