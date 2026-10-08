// ═══════════════════════════════════════════════════════════════
//  TESTS — Fonctions pures de la roadmap F (F4/F6/F1)
//  computeForecast · computeSellerScore · reconciliation · phone
// ═══════════════════════════════════════════════════════════════

import { computeForecast }  from '../../shared/utils/forecast';
import { computeSellerScore, scoreToBadge } from '../../shared/utils/seller-score';
import { reconcileLine, findPaymentForLine } from '../../modules/payments/reconciliation';
// Import en fin de section pour bénéficier des variables d'env du setup Jest
import { phoneFields, decryptPhone } from '../../shared/utils/phone';

describe('F6.2 — computeForecast (moyenne mobile)', () => {
  it('ventes constantes : forecast ≈ moyenne × horizon', () => {
    const series = new Array(180).fill(2); // 2/jour
    const f = computeForecast(series, 5, 10, 30);
    expect(f.avgDailySales).toBeCloseTo(2, 1);
    expect(f.forecastQty).toBe(60);
  });

  it('réappro = forecast + reorderPoint − dispo', () => {
    const series = new Array(180).fill(1);
    const f = computeForecast(series, 10, 15, 30);
    expect(f.recommendedReorderQty).toBe(Math.ceil(30 + 10 - 15)); // 25
  });

  it('stock suffisant : réappro à 0', () => {
    const series = new Array(180).fill(1);
    const f = computeForecast(series, 5, 100, 30);
    expect(f.recommendedReorderQty).toBe(0);
  });

  it('tendance haussière bornée ×2', () => {
    const series = [...new Array(150).fill(1), ...new Array(30).fill(4)];
    const f = computeForecast(series, 5, 0, 30);
    expect(f.trendFactor).toBeLessThanOrEqual(2);
    expect(f.avgDailySales).toBeGreaterThan(1);
  });

  it('tendance baissière bornée ×0.5', () => {
    const series = [...new Array(150).fill(4), ...new Array(30).fill(1)];
    const f = computeForecast(series, 5, 0, 30);
    expect(f.trendFactor).toBeGreaterThanOrEqual(0.5);
  });

  it('série vide : forecast nul, réappro = reorderPoint (objectif de stock minimum)', () => {
    const f = computeForecast([], 5, 0, 30);
    expect(f.forecastQty).toBe(0);
    expect(f.recommendedReorderQty).toBe(5);
  });
});

describe('F4.2 — computeSellerScore / badge', () => {
  it('vendeur parfait : 100 → platinum', () => {
    const score = computeSellerScore({ cancelRate: 0, fulfillmentRate: 1, avgRating: 5 });
    expect(score).toBe(100);
    expect(scoreToBadge(score)).toBe('platinum');
  });

  it('note 3★ neutre, aucun risque : 100 → platinum', () => {
    expect(computeSellerScore({ cancelRate: 0, fulfillmentRate: 1, avgRating: 3 })).toBe(100);
  });

  it('annulations massives : score fortement pénalisé', () => {
    const score = computeSellerScore({ cancelRate: 1, fulfillmentRate: 0, avgRating: 1 });
    expect(score).toBe(0);
    expect(scoreToBadge(score)).toBeNull();
  });

  it('badge gold à 75+, silver à 60+', () => {
    // cancel 0.2 → 100 − 10 − 0 + rating 5(+20) = 110 → clampé... recalcul :
    expect(scoreToBadge(80)).toBe('gold');
    expect(scoreToBadge(65)).toBe('silver');
    expect(scoreToBadge(59)).toBeNull();
    expect(scoreToBadge(null)).toBeNull();
  });

  it('mauvaise note : jusqu\'à −20 points (5★ clampé à 100)', () => {
    const good = computeSellerScore({ cancelRate: 0, fulfillmentRate: 1, avgRating: 5 });
    const bad  = computeSellerScore({ cancelRate: 0, fulfillmentRate: 1, avgRating: 1 });
    expect(good).toBe(100);   // clampé (100 + bonus 20)
    expect(bad).toBe(80);     // 100 − 20
    expect(good - bad).toBe(20); // l'écart visible est réduit par le clamp du max
  });
});

describe('F6.1 — réconciliation MoMo', () => {
  const payments = [
    { id: 'p1', gatewayRef: 'PAY-1', amount: 10000, status: 'completed', financialTransactionId: 'TX-1' },
    { id: 'p2', gatewayRef: 'PAY-2', amount: 5000,  status: 'completed', financialTransactionId: null },
  ];

  it('ligne du relevé = paiement existant même montant → matched', () => {
    const p = findPaymentForLine({ externalRef: 'PAY-1', amount: 10000 }, payments);
    expect(reconcileLine({ externalRef: 'PAY-1', amount: 10000 }, p)).toEqual({ status: 'matched', paymentId: 'p1' });
  });

  it('matching de secours par financialTransactionId', () => {
    const p = findPaymentForLine({ externalRef: 'TX-1', amount: 10000 }, payments);
    expect(p?.id).toBe('p1');
  });

  it('montant divergent → amount_mismatch', () => {
    const p = findPaymentForLine({ externalRef: 'PAY-1', amount: 12000 }, payments);
    expect(reconcileLine({ externalRef: 'PAY-1', amount: 12000 }, p).status).toBe('amount_mismatch');
  });

  it('ligne absente de la plateforme → missing_in_platform', () => {
    expect(reconcileLine({ externalRef: 'GHOST', amount: 100 }, null).status).toBe('missing_in_platform');
  });
});

describe('F1 — chiffrement téléphone', () => {
  // Ces tests nécessitent ENCRYPTION_KEY (défini dans le setup Jest)

  it('rond-trip chiffrer → déchiffrer', () => {
    const f = phoneFields('+237690000001');
    expect(f.phoneEnc).toBeTruthy();
    expect(f.phoneHash).toBe(phoneFields('+237690000001').phoneHash); // hash déterministe
    expect(f.phoneEnc).not.toContain('690000001');                   // pas de clair dans le chiffré
    expect(decryptPhone(f.phoneEnc)).toBe('+237690000001');
  });

  it('null → champs null, decrypt null-safe', () => {
    expect(phoneFields(null)).toEqual({ phoneEnc: null, phoneHash: null });
    expect(decryptPhone(null)).toBeNull();
    expect(decryptPhone('garbage')).toBeNull(); // clé/donnée invalide : pas de crash
  });
});
