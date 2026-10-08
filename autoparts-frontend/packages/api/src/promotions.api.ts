// ── Promotions & codes promo ───────────────────────────────────
// Contrat backend réel : { code, name, type, scope, discountValue,
// minOrderAmount, maxUses?, maxUsesPerUser, validFrom, validUntil }.
import { api, unwrap } from './client';

export interface Promotion {
  id: string;
  code?: string;
  name?: string;
  type: 'percentage' | 'fixed' | 'free_shipping' | 'bogo';
  scope?: 'all' | 'category' | 'product' | 'org';
  discountValue?: number;
  minOrderAmount?: number;
  maxUses?: number | null;
  usesCount?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
  /** Organisation propriétaire (gestion vendeur). */
  orgId?: string | null;
}

export const promotionsApi = {
  /** Catalogue public (toutes orgs confondues). */
  async list(activeOnly = false): Promise<Promotion[]> {
    return unwrap(api.get('/promotions', { params: activeOnly ? { active: true } : undefined }));
  },

  /** Promotions de MON organisation (vendeur). */
  async mine(): Promise<Promotion[]> {
    return unwrap(api.get('/promotions/mine'));
  },

  async validate(dto: { code: string; orderAmount: number; userId?: string }): Promise<unknown> {
    return unwrap(api.post('/promotions/validate', dto));
  },

  async create(dto: {
    code: string;
    name: string;
    type: Promotion['type'];
    scope?: Promotion['scope'];
    discountValue: number;
    minOrderAmount?: number;
    maxUses?: number;
    validFrom?: string;
    validUntil?: string;
  }): Promise<Promotion> {
    return unwrap(api.post('/promotions', dto));
  },

  async toggle(id: string): Promise<Promotion> {
    return unwrap(api.patch(`/promotions/${id}/toggle`));
  },

  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/promotions/${id}`));
  },
};
