// ═══════════════════════════════════════════════════════════════
//  FORECAST (F6.2) — prévision de stock par moyenne mobile pondérée.
//  Honnêteté méthodologique : moving average + facteur de tendance,
//  pas de ML. La colonne `method` des prévisions permet de brancher
//  un modèle plus sophistiqué plus tard.
// ═══════════════════════════════════════════════════════════════

export interface ForecastResult {
  avgDailySales:    number;
  forecastQty:      number;          // sur l'horizon
  recommendedReorderQty: number;     // max(0, forecast + reorderPoint − dispo)
  trendFactor:      number;          // >1 = en croissance, <1 = en décroissance
}

/**
 * @param dailySales   quantités vendues par jour (ordre chronologique, 180 j)
 * @param reorderPoint seuil de réappro de la variante
 * @param available    stock disponible actuel (on_hand − reserved)
 * @param horizonDays  horizon de prévision (30 par défaut)
 */
export function computeForecast(
  dailySales: number[],
  reorderPoint: number,
  available: number,
  horizonDays = 30,
): ForecastResult {
  const clean = dailySales.map(v => Math.max(0, Number(v) || 0));
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const recent = clean.slice(-30);          // 30 derniers jours
  const older  = clean.slice(-90, -30);     // 30→90 jours avant

  const avgRecent = mean(recent);
  const avgOlder  = mean(older);
  // Tendance bornée [0.5, 2] pour éviter les extrapolations absurdes
  const trendFactor = avgOlder > 0 ? Math.min(2, Math.max(0.5, avgRecent / avgOlder)) : 1;

  // Moyenne pondérée : 70 % période récente, 30 % moyenne globale
  const avgOverall = mean(clean);
  const avgDailySales = (avgRecent * 0.7 + avgOverall * 0.3) * trendFactor;

  const forecastQty = Math.round(avgDailySales * horizonDays);
  const recommendedReorderQty = Math.max(0, Math.ceil(forecastQty + reorderPoint - available));

  return {
    avgDailySales: Math.round(avgDailySales * 10000) / 10000,
    forecastQty,
    recommendedReorderQty,
    trendFactor: Math.round(trendFactor * 100) / 100,
  };
}
