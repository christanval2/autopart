/// <reference types="jest" />
/// <reference types="node" />
// ═══════════════════════════════════════════════════════════════
//  TEST SENTINELLE — Aucune route de mutation sans authenticate
//  Parcourt la stack Express réelle de l'app et échoue si une
//  route POST/PUT/PATCH/DELETE n'est pas protégée (par route ou
//  par router.use(authenticate)) et n'est pas explicitement
//  whitelistée (auth publique, webhooks HMAC, secret partagé).
// ═══════════════════════════════════════════════════════════════

// Les variables d'environnement requises sont définies dans
// src/__tests__/setup.ts (setupFiles Jest, exécuté avant ce module).

// Redis in-memory : le test n'exécute aucun handler, il ne fait qu'inspecter
// la stack des routers. On évite toute vraie connexion (qui bouclerait
// indéfiniment sur ECONNREFUSED quand Redis n'est pas lancé).
jest.mock('../src/config/redis', () => {
  const fake = {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 0,
    incr: async () => 1,
    expire: async () => 1,
    sadd: async () => 1,
    srem: async () => 1,
    smembers: async () => [],
    scanStream: () => ({}),
    // rate-limit-redis : SCRIPT LOAD attend un sha (string), EVAL un tableau
    call: async (cmd: string) => (cmd === 'SCRIPT' ? 'fakesha0000000000000000000000000000' : [0, 1]),
    status: 'ready',
  };
  return {
    redis: fake,
    cached: async (_k: string, fetcher: () => unknown) => fetcher(),
    invalidate: async () => undefined,
    storeRefreshToken: async () => undefined,
    revokeRefreshToken: async () => undefined,
    revokeAllUserRefreshTokens: async () => 0,
    CacheKeys: {
      product: (id: string) => `product:${id}`,
      productList: (p: string | number) => `products:list:${p}`,
      catalog: (id: string) => `catalog:${id}`,
      stockVariant: (id: string) => `stock:variant:${id}`,
      orgTiers: () => 'org:tiers:all',
      categories: () => 'categories:tree',
      brands: () => 'brands:all',
      userSession: (u: string) => `session:${u}`,
      refreshToken: (t: string) => `rt:${t}`,
    },
    __esModule: true,
  };
});

import app from '../src/app';
import { authenticate } from '../src/middlewares';

// ─── Whitelist : mutations publiques PAR CONCEPTION ─────────────
// Chaque entrée doit avoir une justification documentée.
const PUBLIC_MUTATIONS: string[] = [
  // Auth : endpoints d'entrée publics par nature
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  // 2FA : seconde étape du login — autorisé par possession du jeton temporaire
  // (24 octets aléatoires, 5 min, usage unique) + code TOTP, rate-limité
  'POST /api/v1/auth/2fa/login-verify',
  // Google OAuth : endpoint d'entrée public par nature — l'autorisation
  // vient du id_token/code vérifié par Google, comme /auth/login. Rate-limité.
  'POST /api/v1/auth/google',
  // Paiements : webhooks opérateurs protégés par HMAC timing-safe
  'POST /api/v1/payments/webhook/mtn',
  'POST /api/v1/payments/webhook/orange',
  // Voice order : endpoint interne agent Python protégé par secret partagé
  'POST /api/v1/voice-order/agent-token',
  // Chatbot : assistant public anonyme (clés user:* anti-IDOR dans le handler)
  'POST /api/v1/chatbot/message',
  // IDEM : purge de l'historique anonyme sans compte ; les sessions
  // user:* restent réservées à leur propriétaire (garde anti-IDOR)
  'DELETE /api/v1/chatbot/history/:sessionKey',
  // Invitations : l'acceptation s'autorise par possession du token secret
  // (48 hex, 7 jours) — pas besoin d'être déjà membre
  'POST /api/v1/organizations/invitations/:token/accept',
  // Analytics : tracking funnel public (view/cart uniquement), rate-limité
  // par IP/user — les events purchase ne passent que par le serveur
  'POST /api/v1/analytics/track',
  // Newsletter F5 : tracking par token destinataire (pixel/clic/désinscription)
  // — la possession du token unique vaut autorisation, pas de données sensibles
  'GET /api/v1/newsletter/campaigns/track/open/:token',
  'GET /api/v1/newsletter/campaigns/track/click/:token',
  'GET /api/v1/newsletter/campaigns/unsubscribe/:token',
];

const MUTATION_METHODS = ['post', 'put', 'patch', 'delete'];

interface RouteIssue { method: string; path: string; }

/**
 * Extrait le préfixe de montage d'un layer app.use.
 * Sur cette version d'Express, layer.path est undefined pour les layers
 * app.use : le chemin est encodé dans layer.regexp
 * (ex. /^\/api\/v1\/auth\/?(?=\/|$)/i → /api/v1/auth).
 */
function layerPrefix(layer: any): string {
  if (typeof layer.path === 'string') return layer.path;
  const src: string = layer.regexp?.source ?? '';
  // Les montages app.use sont des préfixes littéraux : on coupe tout
  // ce qui suit l'ancre ^ et le premier groupe/lookahead
  return src
    .replace(/^\^/, '')
    .split('(')[0]
    .replace(/\\\//g, '/')
    .replace(/\/\?$/, '')   // "/?" = slash optionnel de fin de montage
    .replace(/\/$/, '');
}

function isAuthenticate(handle: unknown): boolean {
  return handle === authenticate;
}

function walkRouter(
  routerStack: any[],
  prefix: string,
  routerUseAuth: boolean,
  issues: RouteIssue[],
): void {
  // Un router.use(authenticate) global protège toutes ses routes
  const globalAuth = routerUseAuth ||
    routerStack.some(l => !l.route && isAuthenticate(l.handle));

  for (const layer of routerStack) {
    if (layer.route) {
      const path    = (prefix + layer.route.path).replace(/\/+/g, '/');
      const methods = Object.keys(layer.route.methods)
        .filter(m => MUTATION_METHODS.includes(m));
      if (!methods.length) continue;

      const routeAuth = layer.route.stack.some((l: any) => isAuthenticate(l.handle));
      for (const method of methods) {
        if (globalAuth || routeAuth) continue;
        const key = `${method.toUpperCase()} ${path}`;
        if (!PUBLIC_MUTATIONS.includes(key)) {
          issues.push({ method: method.toUpperCase(), path });
        }
      }
    } else if (layer.handle?.stack) {
      // Router imbriqué (app.use(prefix, subRouter))
      walkRouter(layer.handle.stack, prefix + layerPrefix(layer), globalAuth, issues);
    }
  }
}

describe('Sentinelle sécurité — routes de mutation', () => {
  it('toutes les routes POST/PUT/PATCH/DELETE sont protégées ou whitelistées', () => {
    const issues: RouteIssue[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walkRouter((app as any)._router.stack, '', false, issues);

    if (issues.length) {
      const detail = issues.map(i => `  ❌ ${i.method} ${i.path}`).join('\n');
      throw new Error(
        `Routes de mutation sans authenticate détectées (${issues.length}) :\n${detail}\n` +
        `→ Ajouter authenticate ou whitelister avec justification dans ${__filename}`,
      );
    }
  });

  it('la whitelist ne référence aucune route inexistante (anti-pourrissement)', async () => {
    const registered = new Set<string>();
    const collect = (routerStack: any[], prefix: string) => {
      for (const layer of routerStack) {
        if (layer.route) {
          const path = (prefix + layer.route.path).replace(/\/+/g, '/');
          for (const m of Object.keys(layer.route.methods)) {
            if (layer.route.methods[m]) registered.add(`${m.toUpperCase()} ${path}`);
          }
        } else if (layer.handle?.stack) {
          collect(layer.handle.stack, prefix + layerPrefix(layer));
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    collect((app as any)._router.stack, '');

    const stale = PUBLIC_MUTATIONS.filter(k => !registered.has(k));
    expect(stale).toEqual([]);
  });
});
