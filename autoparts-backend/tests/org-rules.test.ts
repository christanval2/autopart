/// <reference types="jest" />
// ═══════════════════════════════════════════════════════════════
//  TESTS UNITAIRES — Règles métier org_type (F)
//  Rôle achat/vente, MOQ par défaut, visibilité des tiers de prix.
//  Fonctions pures : aucun accès DB requis.
// ═══════════════════════════════════════════════════════════════

import {
  TIER_GROS_EXPORT, TIER_GROS, TIER_DETAIL,
  visibleTiersFor, canSeeTier, tierPrice, effectiveDiscountRate, tierPriceGrid,
  canSellAs, canBuyB2B, canBuyFrom,
  DEFAULT_TIER_BY_ORG_TYPE, CAN_SELL_BY_DEFAULT, DEFAULT_MOQ_BY_ORG_TYPE, MOQ_UNIT_BY_ORG_TYPE,
  moqMessage,
} from '../src/shared/org-rules';

describe('Visibilité des tiers de prix (règle 3 — filtrage backend)', () => {
  it('un importateur voit les trois tiers', () => {
    expect(visibleTiersFor('importer')).toEqual([TIER_GROS_EXPORT, TIER_GROS, TIER_DETAIL]);
  });

  it('un wholesaler voit gros + détail, jamais gros-export', () => {
    expect(visibleTiersFor('wholesaler')).toEqual([TIER_GROS, TIER_DETAIL]);
    expect(canSeeTier('wholesaler', TIER_GROS_EXPORT)).toBe(false);
  });

  it('un garage NE VOIT JAMAIS « gros » ni « gros-export », même connecté', () => {
    expect(canSeeTier('garage', TIER_GROS)).toBe(false);
    expect(canSeeTier('garage', TIER_GROS_EXPORT)).toBe(false);
    expect(canSeeTier('garage', TIER_DETAIL)).toBe(true);
  });

  it('un retailer est traité comme un garage', () => {
    expect(canSeeTier('retailer', TIER_GROS)).toBe(false);
    expect(canSeeTier('retailer', TIER_DETAIL)).toBe(true);
  });

  it('un invité (non connecté) ne voit que le tier détail', () => {
    expect(visibleTiersFor(null)).toEqual([TIER_DETAIL]);
    expect(canSeeTier(undefined, TIER_GROS)).toBe(false);
  });
});

describe('Grille de prix (le tier est la source de vérité des prix)', () => {
  const tiers = [
    { name: TIER_GROS_EXPORT, discountRate: 20 },
    { name: TIER_GROS,        discountRate: 10 },
    { name: TIER_DETAIL,      discountRate: 0 },
  ];

  it('calcule les prix par remise du tier', () => {
    expect(tierPrice(10000, 20)).toBe(8000);
    expect(tierPrice(10000, '10')).toBe(9000);
    expect(tierPrice(10000, 0)).toBe(10000);
  });

  it('grille complète pour un importateur', () => {
    const { tierPrices } = tierPriceGrid(10000, tiers, 'importer');
    expect(tierPrices).toEqual({ 'gros-export': 8000, 'gros': 9000, 'détail': 10000 });
  });

  it('grille SANS « gros » pour un garage (invocation API directe comprise)', () => {
    const { tierPrices } = tierPriceGrid(10000, tiers, 'garage');
    expect(tierPrices).toEqual({ 'détail': 10000 });
    expect(tierPrices['gros']).toBeUndefined();
    expect(tierPrices['gros-export']).toBeUndefined();
  });

  it('grille invité = détail uniquement', () => {
    const { tierPrices } = tierPriceGrid(10000, tiers, null);
    expect(Object.keys(tierPrices)).toEqual([TIER_DETAIL]);
  });

  it('un garage configuré sur tier « gros » ne paie pas le prix gros (remise = 0)', () => {
    expect(effectiveDiscountRate('garage', TIER_GROS, 10)).toBe(0);
    expect(effectiveDiscountRate('wholesaler', TIER_GROS, 10)).toBe(10);
    expect(effectiveDiscountRate('importer', TIER_GROS_EXPORT, 20)).toBe(20);
    expect(effectiveDiscountRate('wholesaler', TIER_GROS_EXPORT, 20)).toBe(0);
  });

  it('le prix ordonné « gros » respecte gros-export < gros < détail', () => {
    expect(tierPrice(50000, 20)).toBeLessThan(tierPrice(50000, 10));
    expect(tierPrice(50000, 10)).toBeLessThan(tierPrice(50000, 0));
  });
});

describe('Rôles achat/vente par org_type (règle 1)', () => {
  it('importer : vendeur uniquement, jamais acheteur B2B', () => {
    expect(canSellAs('importer', false)).toBe(true);
    expect(canBuyB2B('importer')).toBe(false);
  });

  it('wholesaler : les deux capacités simultanément (même session, sans reconnexion)', () => {
    expect(canSellAs('wholesaler', true)).toBe(true);
    expect(canBuyB2B('wholesaler')).toBe(true);
  });

  it('retailer/garage : acheteur uniquement, sauf can_sell=true activé par un admin', () => {
    expect(canSellAs('garage', false)).toBe(false);
    expect(canSellAs('garage', true)).toBe(true);
    expect(canSellAs('retailer', false)).toBe(false);
    expect(canBuyB2B('garage')).toBe(true);
    expect(canBuyB2B('retailer')).toBe(true);
  });

  it('relations vendeur→acheteur : garage/retailer jamais chez un importer', () => {
    expect(canBuyFrom('wholesaler', 'importer')).toBe(true);
    expect(canBuyFrom('wholesaler', 'wholesaler')).toBe(true);
    expect(canBuyFrom('garage', 'wholesaler')).toBe(true);
    expect(canBuyFrom('retailer', 'wholesaler')).toBe(true);
    expect(canBuyFrom('garage', 'importer')).toBe(false);
    expect(canBuyFrom('retailer', 'importer')).toBe(false);
    expect(canBuyFrom('importer', 'importer')).toBe(false);
    expect(canBuyFrom(null, 'importer')).toBe(false);
  });
});

describe('Défauts à la création (règle 3 + A)', () => {
  it('tier par défaut selon org_type', () => {
    expect(DEFAULT_TIER_BY_ORG_TYPE.importer).toBe(TIER_GROS_EXPORT);
    expect(DEFAULT_TIER_BY_ORG_TYPE.wholesaler).toBe(TIER_GROS);
    expect(DEFAULT_TIER_BY_ORG_TYPE.retailer).toBe(TIER_DETAIL);
    expect(DEFAULT_TIER_BY_ORG_TYPE.garage).toBe(TIER_DETAIL);
  });

  it('can_sell dérivé du org_type (modifiable ensuite par un admin)', () => {
    expect(CAN_SELL_BY_DEFAULT.importer).toBe(true);
    expect(CAN_SELL_BY_DEFAULT.wholesaler).toBe(true);
    expect(CAN_SELL_BY_DEFAULT.retailer).toBe(false);
    expect(CAN_SELL_BY_DEFAULT.garage).toBe(false);
  });

  it('MOQ par défaut d\'un produit : 50 importer (palette), 5 wholesaler (carton), 1 garage/retailer', () => {
    expect(DEFAULT_MOQ_BY_ORG_TYPE.importer).toBe(50);
    expect(DEFAULT_MOQ_BY_ORG_TYPE.wholesaler).toBe(5);
    expect(DEFAULT_MOQ_BY_ORG_TYPE.garage).toBe(1);
    expect(DEFAULT_MOQ_BY_ORG_TYPE.retailer).toBe(1);
    expect(MOQ_UNIT_BY_ORG_TYPE.importer).toBe('palette');
    expect(MOQ_UNIT_BY_ORG_TYPE.wholesaler).toBe('carton');
  });

  it('messages MOQ explicites (fiche produit / panier)', () => {
    expect(moqMessage(50, 'palette')).toBe('Quantité minimum : 50 unités — vente par palette');
    expect(moqMessage(5, 'carton')).toBe('Quantité minimum : 5 unités — vente par carton');
    expect(moqMessage(1, 'unité')).toBe('Quantité minimum : 1 unité');
  });
});
