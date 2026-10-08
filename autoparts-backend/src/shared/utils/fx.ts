// ═══════════════════════════════════════════════════════════════
//  FX — taux de change (E6c)
//  Commandes et paiements restent en XAF (réglementation BEAC) ;
//  la conversion est indicative pour l'affichage.
// ═══════════════════════════════════════════════════════════════

import axios from 'axios';
import { redis } from '../../config/redis';
import { logger } from './logger';

const CACHE_KEY = 'fx:rates';
const TTL = 24 * 3600;

export interface FxRates {
  base: 'XAF';
  // 1 XAF = rates[code]
  rates: Record<string, number>;
  fetchedAt: string;
}

// replans si l'API externe est indisponible (approximation fixe)
const FALLBACK: FxRates = {
  base: 'XAF',
  rates: { XAF: 1, USD: 1 / 600, EUR: 1 / 655.957 },
  fetchedAt: 'fallback',
};

export async function refreshFxRates(): Promise<FxRates> {
  try {
    const { data } = await axios.get('https://open.er-api.com/v6/latest/XAF', { timeout: 10_000 });
    if (data?.result === 'success' && data.rates) {
      const fx: FxRates = { base: 'XAF', rates: data.rates, fetchedAt: new Date().toISOString() };
      await redis.setex(CACHE_KEY, TTL, JSON.stringify(fx));
      return fx;
    }
    throw new Error('réponse invalide');
  } catch (e) {
    logger.warn('FX refresh échoué, fallback statique:', (e as Error).message);
    return FALLBACK;
  }
}

export async function getFxRates(): Promise<FxRates> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as FxRates;
  return refreshFxRates();
}

/** Conversion indicative entre deux devises (XAF par défaut). */
export async function convertFx(amount: number, from = 'XAF', to = 'XAF'): Promise<number> {
  if (from === to) return amount;
  const { rates } = await getFxRates();
  const rFrom = rates[from];
  const rTo   = rates[to];
  if (!rFrom || !rTo) throw new Error(`Devise non supportée : ${!rFrom ? from : to}`);
  // amount en `from` → XAF → `to`
  return Math.round((amount / rFrom) * rTo);
}
