// ═══════════════════════════════════════════════════════════════
//  SELLER SCORE (F4.2) — score de performance vendeur 0-100, pur
//  et testable. Formule transparente :
//    base 100
//    − cancelRate × 50      (annulations = risque client)
//    − (1 − fulfillmentRate) × 30   (commandes jamais expédiées)
//    + bonus note moyenne   ((avgRating − 3) / 2 × 20, borné ±20)
//  Badge dérivé : platinum ≥ 90, gold ≥ 75, silver ≥ 60, sinon aucun.
// ═══════════════════════════════════════════════════════════════

export interface SellerMetrics {
  cancelRate: number;       // 0..1 — annulées / total
  fulfillmentRate: number;  // 0..1 — expédiées ou livrées / non-annulées
  avgRating: number;        // 0..5
}

export function computeSellerScore(m: SellerMetrics): number {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const cancel = clamp01(m.cancelRate);
  const fulfill = clamp01(m.fulfillmentRate);
  const rating = Math.min(5, Math.max(0, m.avgRating));

  const ratingBonus = ((rating - 3) / 2) * 20; // 5★→+20, 3★→0, 1★→−20

  const score = 100 - cancel * 50 - (1 - fulfill) * 30 + ratingBonus;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export function scoreToBadge(score: number | null | undefined): 'platinum' | 'gold' | 'silver' | null {
  if (score == null) return null;
  if (score >= 90) return 'platinum';
  if (score >= 75) return 'gold';
  if (score >= 60) return 'silver';
  return null;
}
