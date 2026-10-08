// ═══════════════════════════════════════════════════════════════
//  RÈGLES MÉTIER ORG_TYPE — rôle achat/vente, MOQ, grille de prix
//  par tier, visibilité catalogue. Fonctions pures (testables sans
//  DB) ; les accès base sont dans les modules appelants.
// ═══════════════════════════════════════════════════════════════

export type OrgType = 'importer' | 'wholesaler' | 'retailer' | 'garage';

// ─── Noms canoniques des tiers de la grille de prix ─────────────
// Le tier est la source de vérité des PRIX (org_tiers.discount_rate
// appliqué au prix de base) ; org_type décide uniquement de ce que
// l'appelant a le droit de VOIR et des défauts à la création.
export const TIER_GROS_EXPORT = 'gros-export';
export const TIER_GROS        = 'gros';
export const TIER_DETAIL      = 'détail';
export const CANONICAL_TIERS  = [TIER_GROS_EXPORT, TIER_GROS, TIER_DETAIL] as const;

// Taux de remise par défaut de la grille (seedés en base, ajustables
// par un admin) : gros-export = prix les plus bas, détail = prix public.
export const DEFAULT_TIER_DISCOUNT: Record<string, number> = {
  [TIER_GROS_EXPORT]: 20,
  [TIER_GROS]:        10,
  [TIER_DETAIL]:      0,
};

// ─── Défauts à la création d'une organisation ────────────────────
export const DEFAULT_TIER_BY_ORG_TYPE: Record<OrgType, string> = {
  importer:   TIER_GROS_EXPORT,
  wholesaler: TIER_GROS,
  retailer:   TIER_DETAIL,
  garage:     TIER_DETAIL,
};

// can_sell dérivé de org_type (modifiable ensuite par un admin :
// c'est le flag qui gère l'exception « garage activé vendeur »).
export const CAN_SELL_BY_DEFAULT: Record<OrgType, boolean> = {
  importer:   true,
  wholesaler: true,
  retailer:   false,
  garage:     false,
};

// ─── MOQ par défaut à la création d'un produit ───────────────────
// Defaut selon org_type du VENDEUR : achat chez un importer = par
// palette (50), chez un wholesaler = par carton (5), chez un
// garage/retailer activé = à l'unité (1). NULL sur Product = pas de MOQ.
export const DEFAULT_MOQ_BY_ORG_TYPE: Record<OrgType, number> = {
  importer:   50,
  wholesaler: 5,
  retailer:   1,
  garage:     1,
};

export const MOQ_UNIT_BY_ORG_TYPE: Record<OrgType, string> = {
  importer:   'palette',
  wholesaler: 'carton',
  retailer:   'unité',
  garage:     'unité',
};

// ─── Matrice de permissions ──────────────────────────────────────

/** Peut lister des produits à la vente (importer/wholesaler, ou can_sell forcé par un admin). */
export function canSellAs(orgType: OrgType | null | undefined, canSell: boolean | null | undefined): boolean {
  return canSell === true || orgType === 'importer' || orgType === 'wholesaler';
}

/** Peut passer des commandes B2B sur la plateforme (l'importateur achète hors plateforme). */
export function canBuyB2B(orgType: OrgType | null | undefined): boolean {
  return orgType === 'wholesaler' || orgType === 'retailer' || orgType === 'garage';
}

/** Relation vendeur→acheteur autorisée (acheter chez un importer : wholesaler uniquement). */
export function canBuyFrom(buyerOrgType: OrgType | null | undefined, sellerOrgType: OrgType): boolean {
  switch (buyerOrgType) {
    case 'wholesaler':          return sellerOrgType === 'importer' || sellerOrgType === 'wholesaler';
    case 'retailer':
    case 'garage':              return sellerOrgType === 'wholesaler';
    default:                    return false; // importer (non acheteur) et sans-org : hors règles B2B
  }
}

// ─── Visibilité des prix par tier ────────────────────────────────
// - « gros-export » : importateurs uniquement (même pas les autres vendeurs)
// - « gros »        : importer + wholesaler, JAMAIS garage/retailer ni invité
// - « détail »      : tout le monde, y compris sans authentification
export function visibleTiersFor(orgType: OrgType | null | undefined): string[] {
  if (orgType === 'importer')   return [TIER_GROS_EXPORT, TIER_GROS, TIER_DETAIL];
  if (orgType === 'wholesaler') return [TIER_GROS, TIER_DETAIL];
  return [TIER_DETAIL]; // retailer, garage, invité, particulier sans org
}

export function canSeeTier(orgType: OrgType | null | undefined, tierName: string): boolean {
  return visibleTiersFor(orgType).includes(tierName);
}

/** Prix d'un tier : prix de base × (1 − remise du tier). Le tier est la source de vérité. */
export function tierPrice(basePrice: number, discountRate: number | string | null | undefined): number {
  const rate = Number(discountRate ?? 0);
  return Math.round(basePrice * (1 - rate / 100) * 100) / 100;
}

/**
 * Remise effective applicable à un acheteur pour payer : le tier de SON
 * organisation, sauf si ce tier n'est pas visible pour son org_type
 * (ex. garage mis sur tier « gros » par un admin : il paie détail
 * jusqu'à correction — un garage ne voit ni ne paie jamais « gros »).
 */
export function effectiveDiscountRate(
  orgType: OrgType | null | undefined,
  tierName: string | null | undefined,
  discountRate: number | string | null | undefined,
): number {
  if (!tierName || !canSeeTier(orgType, tierName)) return 0;
  return Number(discountRate ?? 0);
}

/** Grille de prix renvoyée par l'API : uniquement les tiers autorisés pour l'appelant. */
export function tierPriceGrid(
  basePrice: number,
  tiers: Array<{ name: string; discountRate: number | string }>,
  orgType: OrgType | null | undefined,
): { price: number; tierPrices: Record<string, number> } {
  const byName  = new Map(tiers.map(t => [t.name, t]));
  const detail  = byName.get(TIER_DETAIL);
  const detailPrice = tierPrice(basePrice, detail?.discountRate ?? 0);

  const tierPrices: Record<string, number> = { [TIER_DETAIL]: detailPrice };
  for (const name of visibleTiersFor(orgType)) {
    const t = byName.get(name);
    if (t) tierPrices[name] = tierPrice(basePrice, t.discountRate);
  }

  // Prix « applicable » : le tier de l'org appelante si autorisé, sinon détail.
  return { price: detailPrice, tierPrices };
}

/** Message MOQ standardisé (fiche produit, panier, commande). */
export function moqMessage(minOrderQty: number, unit: string): string {
  return unit === 'unité'
    ? `Quantité minimum : ${minOrderQty} unité${minOrderQty > 1 ? 's' : ''}`
    : `Quantité minimum : ${minOrderQty} unités — vente par ${unit}`;
}
