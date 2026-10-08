/// <reference types="jest" />
/// <reference types="node" />
// ═══════════════════════════════════════════════════════════════
//  TESTS INTÉGRATION — Règles métier org_type (section F)
//  Exécution : RUN_INTEGRATION=1 jest tests/org-type-rules.test.ts --runInBand
//  Pré-requis : Postgres + Redis lancés, base seedée (npm run db:setup).
// ═══════════════════════════════════════════════════════════════

import request from 'supertest';
import { AppDataSource } from '../src/config/database';
import { redis } from '../src/config/redis';
import app from '../src/app';

const INTEGRATION = process.env.RUN_INTEGRATION === '1';
const d = (name: string, fn: () => void) => (INTEGRATION ? describe(name, fn) : describe.skip(name, fn));

async function loginAs(email: string, password = 'ProClient1234!'): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login ${email} échoué: ${res.status}`);
  return res.body.data.accessToken as string;
}

let garageToken: string;      // acheteur garage (MécaniPlus, tier détail)
let importerBuyerToken: string; // buyer dans l'org importer (vendeur uniquement)
let wholesalerToken: string;  // pro@ — acheteur wholesaler (PiecePro, tier gros)
let adminToken: string;       // super_admin

let importerOrgId: string;
let wholesalerOrgId: string;
let garageOrgId: string;
let importerProductId: string;
let importerVariantId: number | string = '';
let importerProductBasePrice = 0;
let importerProductMoq = 0;

let garageAddrBilling: string;
let garageAddrShipping: string;
let importerAddrBilling: string;
let importerAddrShipping: string;

beforeAll(async () => {
  await AppDataSource.initialize();
  try { await redis.connect(); } catch { /* déjà connecté */ }
  const manager = AppDataSource.manager;

  garageToken        = await loginAs('garage@autoparts.cm');
  importerBuyerToken = await loginAs('importer@autoparts.cm');
  wholesalerToken    = await loginAs('pro@autoparts.cm');
  adminToken         = await loginAs('admin@test.cm', 'Test1234!');

  const orgs = await manager.query(
    `SELECT id, org_type FROM organizations WHERE org_type IN ('importer','wholesaler','garage')`,
  );
  importerOrgId   = orgs.find((o: any) => o.org_type === 'importer').id;
  wholesalerOrgId = orgs.find((o: any) => o.org_type === 'wholesaler').id;
  garageOrgId     = orgs.find((o: any) => o.org_type === 'garage').id;

  const [prod] = await manager.query(
    `SELECT p.id, p.base_price, p.min_order_qty FROM products p
     JOIN organizations o ON o.id = p.org_id
     WHERE o.org_type = 'importer' AND p.is_active = true LIMIT 1`,
  );
  importerProductId   = prod.id;
  importerProductBasePrice = Number(prod.base_price);
  importerProductMoq  = Number(prod.min_order_qty);

  const [variant] = await manager.query(
    `SELECT id FROM product_variants WHERE product_id = $1 AND is_active = true LIMIT 1`,
    [importerProductId],
  );
  importerVariantId = variant.id;

  const addrFor = async (email: string) => (await manager.query(
    `SELECT id FROM addresses WHERE user_id = (SELECT id FROM users WHERE email = $1) ORDER BY is_default ASC`,
    [email],
  )).map((a: any) => a.id);
  [garageAddrBilling, garageAddrShipping]     = await addrFor('garage@autoparts.cm');
  [importerAddrBilling, importerAddrShipping] = await addrFor('importer@autoparts.cm');
});

afterAll(async () => {
  await AppDataSource.destroy();
  await redis.quit();
});

// ─── F.1 — un garage authentifié ne peut PAS récupérer les prix « gros » ───

d('F1. Garage authentifié vs prix « gros » (appel API direct)', () => {
  it('GET /products : aucun prix gros/gros-export dans les réponses', async () => {
    const res = await request(app)
      .get('/api/v1/products').query({ limit: 50 })
      .set('Authorization', `Bearer ${garageToken}`);
    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(Object.keys(p.tierPrices ?? {})).toEqual(['détail']);
      expect(p.tierPrices['gros']).toBeUndefined();
      expect(p.tierPrices['gros-export']).toBeUndefined();
    }
  });

  it('GET /products/:id d\'un produit importer → 404 (invisible pour un garage)', async () => {
    const res = await request(app)
      .get(`/api/v1/products/${importerProductId}`)
      .set('Authorization', `Bearer ${garageToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /search : aucun prix gros/gros-export', async () => {
    const res = await request(app)
      .get('/api/v1/search').query({ q: 'frein' })
      .set('Authorization', `Bearer ${garageToken}`);
    expect(res.status).toBe(200);
    for (const p of res.body.data ?? []) {
      expect(p.tierPrices?.['gros']).toBeUndefined();
      expect(p.tierPrices?.['gros-export']).toBeUndefined();
    }
  });

  it('un wholesaler, lui, voit bien le prix « gros »', async () => {
    const res = await request(app)
      .get(`/api/v1/products/${importerProductId}`)
      .set('Authorization', `Bearer ${wholesalerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tierPrices['gros']).toBeDefined();
    expect(res.body.data.tierPrices['gros-export']).toBeUndefined();
    // Prix applicable = son tier (gros) = base − 10 %
    expect(Number(res.body.data.price)).toBe(Math.round(importerProductBasePrice * 0.9));
  });
});

// ─── F.2 — ajout au panier sous le MOQ bloqué ────────────────────

d('F2. Panier : MOQ bloqué côté backend', () => {
  // Le panier persiste en base entre les exécutions : on repart de zéro
  // pour que les quantités de test soient prévisibles.
  beforeEach(async () => {
    await request(app).delete('/api/v1/cart').set('Authorization', `Bearer ${wholesalerToken}`);
  });

  it('refuse une quantité sous le MOQ du produit (importer = 50/palette)', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${wholesalerToken}`)
      .send({ variantId: importerVariantId, quantity: Math.max(1, Math.min(5, importerProductMoq - 1)) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Quantité minimum');
  });

  it('accepte une quantité >= MOQ', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${wholesalerToken}`)
      .send({ variantId: importerVariantId, quantity: importerProductMoq });
    expect([201, 200]).toContain(res.status);
  });

  it('refuse la modification sous le MOQ', async () => {
    const add = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${wholesalerToken}`)
      .send({ variantId: importerVariantId, quantity: importerProductMoq });
    const itemId = add.body?.data?.id;
    if (!itemId) return; // stock absent : l'ajout a pu échouer ailleurs
    const res = await request(app)
      .patch(`/api/v1/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${wholesalerToken}`)
      .send({ quantity: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Quantité minimum');
  });
});

// ─── F.3 — un importer ne peut pas passer de commande B2B (403) ──

d('F3. Importer = vendeur uniquement', () => {
  it('POST /orders en b2b → 403 backend', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${importerBuyerToken}`)
      .send({
        sellerOrgId: wholesalerOrgId,
        channel: 'b2b',
        billingAddressId: importerAddrBilling,
        shippingAddressId: importerAddrShipping,
        lines: [{ variantId: importerVariantId, quantity: 5 }],
        currency: 'XAF',
      });
    expect(res.status).toBe(403);
  });
});

// ─── F.4 — catalogue public (non connecté) : détail uniquement ───

d('F4. Catalogue public sans authentification', () => {
  it('GET /products : uniquement des produits public_listing, prix détail seuls', async () => {
    const res = await request(app).get('/api/v1/products').query({ limit: 50 });
    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(p.publicListing).toBe(true);
      expect(Object.keys(p.tierPrices ?? {})).toEqual(['détail']);
    }
  });

  it('GET /search sans auth : aucun prix gros/gros-export', async () => {
    const res = await request(app).get('/api/v1/search').query({ q: 'frein' });
    expect(res.status).toBe(200);
    for (const p of res.body.data ?? []) {
      expect(p.tierPrices?.['gros']).toBeUndefined();
      expect(p.tierPrices?.['gros-export']).toBeUndefined();
    }
  });
});

// ─── Règles de commande par relation vendeur→acheteur ────────────

d('Relations achat (garage→importer interdit, wholesaler→importer autorisé)', () => {
  it('un garage ne peut pas commander chez un importer (403)', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${garageToken}`)
      .send({
        sellerOrgId: importerOrgId,
        channel: 'b2b',
        billingAddressId: garageAddrBilling,
        shippingAddressId: garageAddrShipping,
        lines: [{ variantId: importerVariantId, quantity: importerProductMoq }],
        currency: 'XAF',
      });
    expect(res.status).toBe(403);
  });

  it('un wholesaler peut commander chez un importer (prix tier gros appliqué)', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${wholesalerToken}`)
      .send({
        sellerOrgId: importerOrgId,
        channel: 'b2b',
        billingAddressId: garageAddrBilling, // uuid valide requis, pas de contrôle de propriété
        shippingAddressId: garageAddrShipping,
        lines: [{ variantId: importerVariantId, quantity: importerProductMoq }],
        currency: 'XAF',
      });
    // 201 attendu ; 409 si le stock seedé aléatoire est < MOQ
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      const line = res.body.data.lines[0];
      expect(Number(line.unitPrice)).toBe(Math.round(importerProductBasePrice * 0.9));
    }
  });
});

// ─── Toggle can_sell (exception garage activé vendeur) ───────────

d('Gestion can_sell par un admin', () => {
  it('un org_admin ne peut PAS s\'auto-activer vendeur (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/organizations/${garageOrgId}`)
      .set('Authorization', `Bearer ${garageToken}`)
      .send({ canSell: true });
    expect(res.status).toBe(403);
  });

  it('un super_admin peut activer puis désactiver la vente du garage', async () => {
    const on = await request(app)
      .post(`/api/v1/organizations/${garageOrgId}/can-sell`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ canSell: true });
    expect(on.status).toBe(200);
    expect(on.body.data.canSell).toBe(true);

    const off = await request(app)
      .post(`/api/v1/organizations/${garageOrgId}/can-sell`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ canSell: false });
    expect(off.status).toBe(200);
    expect(off.body.data.canSell).toBe(false);
  });

  it('GET /auth/me expose le résumé org (orgType, canSell, tier) pour la session', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${garageToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.org).toMatchObject({ orgType: 'garage', canSell: false });
    expect(res.body.data.org.tier.name).toBe('détail');
  });
});
