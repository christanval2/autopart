/// <reference types="jest" />
/// <reference types="node" />
// ═══════════════════════════════════════════════════════════════
//  TESTS — Exemples Jest + Supertest
// ═══════════════════════════════════════════════════════════════

import request   from 'supertest';
import { AppDataSource } from '../src/config/database';
import { redis } from '../src/config/redis';
import app       from '../src/app';
import { Organization } from '../src/entities/Organization';
import { ProductVariant } from '../src/entities/ProductVariant';
import { Warehouse } from '../src/entities/Warehouse';
import { Address } from '../src/entities/Address';

// ─── Helpers ─────────────────────────────────────────────────────

async function loginAs(role: 'buyer' | 'seller' | 'admin') {
  const credentials: Record<string, { email: string; password: string }> = {
    buyer:  { email: 'buyer@test.cm',  password: 'Test1234!' },
    seller: { email: 'seller@test.cm', password: 'Test1234!' },
    admin:  { email: 'admin@test.cm',  password: 'Test1234!' },
  };
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send(credentials[role]);
  return res.body.data.accessToken as string;
}

// ─── Setup / Teardown ─────────────────────────────────────────────

let testOrgId: string;
let testVariantId: string;
let testWarehouseId: string;
let testAddressBillingId: string;
let testAddressShippingId: string;
// Règles org_type : MOQ du produit testé (vente par palette chez un importer)
let testVariantMoq: number;

beforeAll(async () => {
  await AppDataSource.initialize();
  try {
    await redis.connect();
  } catch {
    // Redis may already be connecting (lazyConnect triggered by middleware)
  }

  // Récupérer des UUIDs réels depuis la DB pour les tests
  const manager = AppDataSource.manager;

  const [orgRow] = await manager.query('SELECT id FROM organizations WHERE is_verified = true LIMIT 1');
  testOrgId = orgRow.id;

  const [variantRow] = await manager.query(`
    SELECT pv.id, COALESCE(p.min_order_qty, 1) AS moq
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.is_active = true LIMIT 1`);
  testVariantId = variantRow.id;
  testVariantMoq = Number(variantRow.moq);

  const [whRow] = await manager.query('SELECT id FROM warehouses WHERE org_id = $1 LIMIT 1', [testOrgId]);
  testWarehouseId = whRow.id;

  const addrRows = await manager.query(
    'SELECT id FROM addresses WHERE user_id = (SELECT id FROM users WHERE email = $1) ORDER BY is_default ASC',
    ['buyer@test.cm'],
  );
  testAddressBillingId = addrRows[0].id;
  testAddressShippingId = addrRows[1] ? addrRows[1].id : addrRows[0].id;
});

afterAll(async () => {
  await AppDataSource.destroy();
  await redis.quit();
});

// ─── Tests Auth ───────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('crée un compte avec des données valides', async () => {
    const uniqueEmail = `newuser_${Date.now()}@test.cm`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email:       uniqueEmail,
        password:    'Test1234!',
        firstName:   'Jean',
        lastName:    'Dupont',
        accountType: 'individual',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(uniqueEmail);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined(); // jamais exposé
  });

  it('rejette un email déjà utilisé', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'taken@test.cm', password: 'Test1234!', firstName: 'AA', lastName: 'BB',
    });
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'taken@test.cm', password: 'Test1234!', firstName: 'AA', lastName: 'BB',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('rejette un mot de passe faible', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `weak_${Date.now()}@test.cm`, password: 'weak', firstName: 'AB', lastName: 'CD' });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
    );
  });
});

describe('POST /api/v1/auth/login', () => {
  it('retourne des tokens avec des credentials valides', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@test.cm', password: 'Test1234!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('renvoie 401 sur mauvais mot de passe', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@test.cm', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

// ─── Tests Products ───────────────────────────────────────────────

describe('GET /api/v1/products', () => {
  it('liste les produits sans authentification', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('supporte le filtre par marque véhicule', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ make: 'Toyota', model: 'Hilux', year: 2019 });
    expect(res.status).toBe(200);
  });

  it('pagine correctement', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ page: 1, limit: 5 });
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });
});

describe('POST /api/v1/products', () => {
  it('refuse sans authentification', async () => {
    const res = await request(app).post('/api/v1/products').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('refuse avec un rôle insuffisant (buyer)', async () => {
    const token = await loginAs('buyer');
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', sku: 'SKU-001', basePrice: 5000, categoryId: '...', brandId: '...' });
    expect(res.status).toBe(403);
  });
});

// ─── Tests Orders ─────────────────────────────────────────────────

describe('POST /api/v1/orders', () => {
  let buyerToken: string;

  beforeAll(async () => {
    buyerToken = await loginAs('buyer');
  });

  it('crée une commande B2C valide', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        sellerOrgId:      testOrgId,
        channel:          'b2c',
        billingAddressId: testAddressBillingId,
        shippingAddressId: testAddressShippingId,
        lines: [{ variantId: testVariantId, quantity: Math.max(2, testVariantMoq) }],
        currency: 'XAF',
      });
    expect([201, 409]).toContain(res.status); // 409 si stock insuffisant
    if (res.status === 201) {
      expect(res.body.data.orderNumber).toMatch(/^ORD-/);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.lines).toHaveLength(1);
    }
  });

  it('refuse une commande sans lignes', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        sellerOrgId: testOrgId, channel: 'b2c',
        billingAddressId: testAddressBillingId, shippingAddressId: testAddressShippingId,
        lines: [],
      });
    expect(res.status).toBe(422);
  });
});

// ─── Tests Stock ──────────────────────────────────────────────────

describe('POST /api/v1/stock/adjust', () => {
  it('refuse sans authentification', async () => {
    const res = await request(app).post('/api/v1/stock/adjust').send({});
    expect(res.status).toBe(401);
  });

  it('refuse un ajustement rendant le stock négatif', async () => {
    const token = await loginAs('seller'); // org_admin
    const res = await request(app)
      .post('/api/v1/stock/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId: testWarehouseId,
        variantId:   testVariantId,
        delta:       -99999,
        reason:      'correction',
      });
    expect([409, 404]).toContain(res.status);
  });
});


// ─── Tests unitaires — helpers ────────────────────────────────────

// tests/unit/helpers.test.ts

import { generateOrderNumber, generateOTP, generateSlug, encrypt, decrypt } from '../src/shared/utils/helpers';

describe('generateOrderNumber', () => {
  it('génère un format ORD-YYYYMMDD-XXXXX', () => {
    const ref = generateOrderNumber();
    expect(ref).toMatch(/^ORD-\d{8}-\d{5}$/);
  });
  it('génère des valeurs uniques', () => {
    const set = new Set(Array.from({ length: 100 }, generateOrderNumber));
    expect(set.size).toBeGreaterThan(90);
  });
});

describe('generateOTP', () => {
  it('génère 6 chiffres par défaut', () => {
    const otp = generateOTP();
    expect(otp).toHaveLength(6);
    expect(otp).toMatch(/^\d+$/);
  });
  it('génère la longueur demandée', () => {
    expect(generateOTP(4)).toHaveLength(4);
  });
});

describe('generateSlug', () => {
  it('convertit les accents et espaces', () => {
    expect(generateSlug('Disque de frein arrière')).toBe('disque-de-frein-arriere');
  });
  it('supprime les caractères spéciaux', () => {
    expect(generateSlug('Plaquettes (ABS) & Frein')).toBe('plaquettes-abs-frein');
  });
});

describe('encrypt / decrypt', () => {
  // ENCRYPTION_KEY doit être défini pour ces tests
  it('chiffre et déchiffre correctement', () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    const text      = 'donnée sensible';
    const encrypted = encrypt(text);
    expect(encrypted).not.toBe(text);
    expect(decrypt(encrypted)).toBe(text);
  });
});
