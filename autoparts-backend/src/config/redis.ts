import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../shared/utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: true,
});

redis.on('connect',    () => logger.info('✅ Redis connecté'));
redis.on('error',      (err) => logger.error('Redis erreur:', err));
redis.on('reconnecting',() => logger.warn('Redis: reconnexion...'));

// ─── Helpers cache ────────────────────────────────────────────────

/**
 * Cache-aside pattern : cherche en cache, sinon exécute le fetcher et met en cache
 */
export async function cached<T>(
  key:     string,
  fetcher: () => Promise<T>,
  ttl:     number = env.REDIS_TTL_DEFAULT,
): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;

  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

/**
 * Invalide un ou plusieurs patterns de clés.
 * Utilise SCAN (itératif, non bloquant) — jamais KEYS qui bloque Redis en O(N).
 */
export async function invalidate(...patterns: string[]): Promise<void> {
  for (const pattern of patterns) {
    const stream = redis.scanStream({ match: pattern, count: 200 });
    for await (const keys of stream) {
      if (keys.length) await redis.del(...(keys as string[]));
    }
  }
}

/**
 * Compteur rate-limit glissant
 */
export async function rateWindow(
  key:    string,
  limit:  number,
  window: number, // secondes
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, window);
  const ttl = await redis.ttl(key);
  return {
    allowed:   current <= limit,
    remaining: Math.max(0, limit - current),
    reset:     Date.now() + ttl * 1000,
  };
}

// Namespaces de clés de cache
export const CacheKeys = {
  product:        (id: string)    => `product:${id}`,
   productList:    (page: string | number)  => `products:list:${page}`,
  catalog:        (id: string)    => `catalog:${id}`,
  stockVariant:   (id: string)    => `stock:variant:${id}`,
  orgTiers:       ()              => `org:tiers:all`,
  categories:     ()              => `categories:tree`,
  brands:         ()              => `brands:all`,
  userSession:    (userId: string)=> `session:${userId}`,
  refreshToken:   (token: string) => `rt:${token}`,
} as const;

// ─── Refresh tokens : stockage + index par utilisateur ────────────
// Un set par utilisateur (`rt-index:<userId>`) référence ses refresh
// tokens : la révocation en masse (reset password) se fait en O(tokens
// de l'utilisateur) sans jamais scanner tout l'espace de clés.

const refreshTokenIndex = (userId: string) => `rt-index:${userId}`;

export async function storeRefreshToken(token: string, userId: string, ttlSeconds: number): Promise<void> {
  await redis.setex(CacheKeys.refreshToken(token), ttlSeconds, userId);
  await redis.sadd(refreshTokenIndex(userId), token);
  await redis.expire(refreshTokenIndex(userId), ttlSeconds + 3600);
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const userId = await redis.get(CacheKeys.refreshToken(token));
  await redis.del(CacheKeys.refreshToken(token));
  if (userId) await redis.srem(refreshTokenIndex(userId), token);
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<number> {
  const tokens = await redis.smembers(refreshTokenIndex(userId));
  let revoked = 0;
  for (const token of tokens) {
    const owner = await redis.get(CacheKeys.refreshToken(token));
    if (owner === userId) {
      await redis.del(CacheKeys.refreshToken(token));
      revoked++;
    }
    await redis.srem(refreshTokenIndex(userId), token);
  }
  return revoked;
}
