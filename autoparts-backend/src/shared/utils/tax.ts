// ═══════════════════════════════════════════════════════════════
//  TAX — TVA configurable (E6e)
//  Source de vérité : table tax_configs (migrée avec seed CM = 19,25 %).
//  Fallback : 19,25 % si la table est vide (tva camerounaise).
// ═══════════════════════════════════════════════════════════════

import { AppDataSource } from '../../config/database';
import { TaxConfig }    from '../../entities/TaxConfig';
import { redis }        from '../../config/redis';

const CACHE_KEY = 'tax:rate:CM';
const TTL = 3600;
export const FALLBACK_RATE = 0.1925; // TVA Cameroun

export async function getVatRate(countryCode = 'CM'): Promise<number> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return Number(cached);

  const config = await AppDataSource.getRepository(TaxConfig)
    .findOneBy({ countryCode, isActive: true });
  const rate = config ? Number(config.rate) : FALLBACK_RATE;
  await redis.setex(CACHE_KEY, TTL, String(rate));
  return rate;
}

export async function setVatRate(countryCode: string, rate: number, exemptedCategoryIds: string[] = []): Promise<TaxConfig> {
  const repo = AppDataSource.getRepository(TaxConfig);
  const existing = await repo.findOneBy({ countryCode });
  const saved = await repo.save(existing
    ? Object.assign(existing, { rate, exemptedCategoryIds })
    : repo.create({ countryCode, rate, exemptedCategoryIds }));
  await redis.del(CACHE_KEY);
  return saved;
}
