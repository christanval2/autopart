// ═══════════════════════════════════════════════════════════════
//  TESTS — Index de refresh tokens par utilisateur (Phase 4)
//  Mocker ioredis (et pas le module config/redis) pour exercer les
//  VRAIES fonctions store/revoke/revokeAll sur un client en mémoire :
//  la révocation en masse ne doit toucher aux tokens d'AUCUN autre user.
// ═══════════════════════════════════════════════════════════════

// Redis en mémoire minimal (les commandes utilisées par config/redis)
const store = new Map<string, string>();
const sets  = new Map<string, Set<string>>();

jest.mock('ioredis', () => {
  const FakeRedis = jest.fn().mockImplementation(() => ({
    get:        async (k: string) => store.get(k) ?? null,
    setex:      async (k: string, _ttl: number, v: string) => { store.set(k, v); },
    del:        async (...keys: string[]) => { let n = 0; for (const k of keys) if (store.delete(k)) n++; return n; },
    sadd:       async (k: string, m: string) => { if (!sets.has(k)) sets.set(k, new Set()); sets.get(k)!.add(m); return 1; },
    srem:       async (k: string, m: string) => sets.get(k)?.delete(m) ? 1 : 0,
    smembers:   async (k: string) => [...(sets.get(k) ?? [])],
    expire:     async () => 1,
    on:         () => {},
    status:     'ready',
  }));
  return { __esModule: true, default: FakeRedis };
});

import { storeRefreshToken, revokeRefreshToken, revokeAllUserRefreshTokens, CacheKeys } from '../../config/redis';

describe('Index de refresh tokens par utilisateur', () => {
  beforeEach(() => { store.clear(); sets.clear(); });

  it('storeRefreshToken référence le token dans l\'index du user', async () => {
    await storeRefreshToken('tok-1', 'user-A', 3600);
    expect(store.get('rt:tok-1')).toBe('user-A');
    expect(sets.get('rt-index:user-A')?.has('tok-1')).toBe(true);
  });

  it('revokeRefreshToken supprime le token et nettoie l\'index', async () => {
    await storeRefreshToken('tok-1', 'user-A', 3600);
    await revokeRefreshToken('tok-1');
    expect(store.has('rt:tok-1')).toBe(false);
    expect(sets.get('rt-index:user-A')?.has('tok-1')).toBe(false);
  });

  it('revokeAllUserRefreshTokens révoque tous les tokens DU user, pas les autres', async () => {
    await storeRefreshToken('a-1', 'user-A', 3600);
    await storeRefreshToken('a-2', 'user-A', 3600);
    await storeRefreshToken('b-1', 'user-B', 3600);

    const revoked = await revokeAllUserRefreshTokens('user-A');

    expect(revoked).toBe(2);
    expect(store.has('rt:a-1')).toBe(false);
    expect(store.has('rt:a-2')).toBe(false);
    expect(store.get('rt:b-1')).toBe('user-B'); // user B intact
    expect(CacheKeys.refreshToken('b-1')).toBe('rt:b-1');
  });

  it('revokeAll sur un user sans token ne fait rien', async () => {
    const revoked = await revokeAllUserRefreshTokens('ghost');
    expect(revoked).toBe(0);
  });
});
