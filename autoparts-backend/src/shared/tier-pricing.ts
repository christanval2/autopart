// ═══════════════════════════════════════════════════════════════
//  GRILLE DE PRIX PAR TIER — accès DB + décoration des produits.
//  Complète org-rules.ts (règles pures) avec le chargement des
//  tiers et du contexte appelant. Le filtrage des prix se fait
//  ICI, backend : un garage ne reçoit jamais de prix « gros »,
//  même via un appel API direct.
// ═══════════════════════════════════════════════════════════════

import { AppDataSource } from '../config/database';
import { cached } from '../config/redis';
import { OrgTier } from '../entities/OrgTier';
import { Organization, OrgType } from '../entities/Organization';
import { Product } from '../entities/Product';
import {
  TIER_DETAIL, TIER_GROS, TIER_GROS_EXPORT,
  tierPrice, visibleTiersFor, canSeeTier, effectiveDiscountRate,
  MOQ_UNIT_BY_ORG_TYPE, moqMessage, OrgType as OrgTypeRule,
} from './org-rules';

export interface TierRef { name: string; discountRate: number | string }

export interface ViewerCtx {
  userId: string | null;
  isSuperAdmin: boolean;
  orgId: string | null;
  orgType: OrgType | null;
  canSell: boolean;
  tierName: string | null;
  tierDiscountRate: number;
}

/** Tiers de la grille de prix (cache 60 s — la liste change rarement). */
export async function loadTiers(): Promise<TierRef[]> {
  return cached('org:tiers:pricing', async () => {
    const rows = await AppDataSource.getRepository(OrgTier)
      .find({ select: ['name', 'discountRate'], order: { discountRate: 'DESC' } });
    return rows.map(t => ({ name: t.name, discountRate: t.discountRate }));
  }, 60) as Promise<TierRef[]>;
}

/**
 * Contexte d'appelant pour le filtrage catalogue : invité (null),
 * particulier sans organisation (détail), ou membre d'une organisation
 * (org_type + tier déterminent les prix renvoyés).
 */
export async function loadViewerCtx(user?: { id: string; orgId?: string | null; roles: string[] } | null): Promise<ViewerCtx> {
  const base: ViewerCtx = {
    userId: user?.id ?? null,
    isSuperAdmin: !!user?.roles?.includes('super_admin'),
    orgId: null,
    orgType: null,
    canSell: false,
    tierName: null,
    tierDiscountRate: 0,
  };
  if (!user?.orgId) return base;

  const org = await AppDataSource.getRepository(Organization).findOne({
    where: { id: user.orgId },
    relations: ['tier'],
  });
  if (!org) return base;
  return {
    ...base,
    orgId: org.id,
    orgType: org.orgType,
    canSell: org.canSell === true,
    tierName: org.tier?.name ?? null,
    tierDiscountRate: Number(org.tier?.discountRate ?? 0),
  };
}

/**
 * Visibilité catalogue (règle 4) :
 * - invité / particulier : produits public_listing de vendeurs non-importateurs, tier détail
 * - importer : ses produits + le catalogue public
 * - wholesaler : produits des importateurs (pour acheter) + les siens
 * - retailer/garage : produits des wholesalers + les siens (s'il peut vendre)
 * - super_admin : tout (modération)
 */
export function visibilityCondition(viewer: ViewerCtx): { clause: string; params: Record<string, unknown> } | null {
  if (viewer.isSuperAdmin) return null; // pas de filtre
  const t = { o: Math.random().toString(36).slice(2, 8) };
  switch (viewer.orgType) {
    case 'importer':
      return {
        clause: `(p.orgId = :${t.o} OR (p.publicListing = true AND sellerOrg.orgType != 'importer'))`,
        params: { [t.o]: viewer.orgId },
      };
    case 'wholesaler':
      return {
        clause: `(sellerOrg.orgType = 'importer' OR p.orgId = :${t.o})`,
        params: { [t.o]: viewer.orgId },
      };
    case 'retailer':
    case 'garage':
      return {
        clause: `(sellerOrg.orgType = 'wholesaler' OR p.orgId = :${t.o})`,
        params: { [t.o]: viewer.orgId },
      };
    default:
      // Invité ou particulier sans org : catalogue public uniquement
      return {
        clause: `(p.publicListing = true AND sellerOrg.orgType IN ('wholesaler','retailer','garage'))`,
        params: {},
      };
  }
}

/** Un produit précis est-il visible pour cet appelant ? */
export function isProductVisible(product: Product, viewer: ViewerCtx): boolean {
  if (viewer.isSuperAdmin) return true;
  const sellerType = (product.org?.orgType ?? null) as OrgType | null;
  const own = !!viewer.orgId && product.orgId === viewer.orgId;
  switch (viewer.orgType) {
    case 'importer':
      return own || (product.publicListing === true && sellerType !== 'importer');
    case 'wholesaler':
      return own || sellerType === 'importer';
    case 'retailer':
    case 'garage':
      return own || sellerType === 'wholesaler';
    default:
      return product.publicListing === true
        && (sellerType === 'wholesaler' || sellerType === 'retailer' || sellerType === 'garage');
  }
}

/**
 * Décore des produits avec la grille de prix AUTORISÉE pour l'appelant :
 * - `tierPrices` : uniquement les tiers visibles (détail toujours ;
 *   gros si importer/wholesaler ; gros-export si importer)
 * - `price` : prix applicable à l'appelant (son tier si autorisé, sinon détail)
 * - `moq` : { quantity, unit, message } ou null
 * Le prix de base n'est jamais retiré : c'est le prix détail, visible de tous.
 */
export function decorateProducts<T extends Product | Omit<Product, 'org'> & { org?: Organization | null }>(
  products: T[],
  viewer: ViewerCtx,
  tiers: TierRef[],
): T[] {
  const byName = new Map(tiers.map(t => [t.name, t]));
  const detailTier = byName.get(TIER_DETAIL);
  const visible = new Set(visibleTiersFor(viewer.orgType));

  for (const p of products) {
    const basePrice = Number((p as Product).basePrice);
    const sellerType = ((p as Product).org?.orgType ?? null) as OrgTypeRule | null;

    const tierPrices: Record<string, number> = {
      [TIER_DETAIL]: tierPrice(basePrice, detailTier?.discountRate ?? 0),
    };
    if (visible.has(TIER_GROS)) {
      const t = byName.get(TIER_GROS);
      if (t) tierPrices[TIER_GROS] = tierPrice(basePrice, t.discountRate);
    }
    if (visible.has(TIER_GROS_EXPORT)) {
      const t = byName.get(TIER_GROS_EXPORT);
      if (t) tierPrices[TIER_GROS_EXPORT] = tierPrice(basePrice, t.discountRate);
    }

    // Prix applicable : tier de l'appelant si visible pour son org_type,
    // sinon détail (ex. garage mis sur tier « gros » : il paie/voit détail).
    const ownVisible = viewer.tierName && canSeeTier(viewer.orgType, viewer.tierName)
      && byName.has(viewer.tierName);
    const price = ownVisible
      ? tierPrice(basePrice, byName.get(viewer.tierName!)!.discountRate)
      : tierPrices[TIER_DETAIL];

    const moqQty = (p as Product).minOrderQty;
    const unit = sellerType ? MOQ_UNIT_BY_ORG_TYPE[sellerType] : 'unité';

    Object.assign(p, {
      price,
      tierPrices,
      moq: moqQty != null && moqQty > 0
        ? { quantity: moqQty, unit: unit ?? 'unité', message: moqMessage(moqQty, unit ?? 'unité') }
        : null,
    });
  }
  return products;
}

/** Remise effectivement applicable à un acheteur (0 si son tier n'est pas autorisé). */
export function buyerDiscountRate(viewer: ViewerCtx): number {
  return effectiveDiscountRate(viewer.orgType, viewer.tierName, viewer.tierDiscountRate);
}
