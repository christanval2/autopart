// ═══════════════════════════════════════════════════════════════
//  SEED DÉMO — complète chaque table jusqu'à ≥ 20 lignes.
//  Idempotent : ne crée que ce qui manque (jamais de doublons),
//  préserve les données existantes.
//  Usage : npm run seed:demo
// ═══════════════════════════════════════════════════════════════
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/data-source';
import * as crypto from 'crypto';

import { User } from '../src/entities/User';
import { Organization } from '../src/entities/Organization';
import { OrgTier } from '../src/entities/OrgTier';
import { OrgInvitation } from '../src/entities/OrgInvitation';
import { OrgDocument } from '../src/entities/OrgDocument';
import { Category } from '../src/entities/Category';
import { Brand } from '../src/entities/Brand';
import { Product } from '../src/entities/Product';
import { ProductVariant } from '../src/entities/ProductVariant';
import { ProductImage } from '../src/entities/ProductImage';
import { ProductCompatibility } from '../src/entities/ProductCompatibility';
import { ProductEvent } from '../src/entities/ProductEvent';
import { ProductQA } from '../src/entities/ProductQA';
import { PriceHistory } from '../src/entities/PriceHistory';
import { Warehouse } from '../src/entities/Warehouse';
import { StockLevel } from '../src/entities/StockLevel';
import { StockMovement } from '../src/entities/StockMovement';
import { StockAudit } from '../src/entities/StockAudit';
import { StockForecast } from '../src/entities/StockForecast';
import { Address } from '../src/entities/Address';
import { Cart, CartItem } from '../src/entities/Cart';
import { Order } from '../src/entities/Order';
import { OrderLine } from '../src/entities/OrderLine';
import { OrderApproval } from '../src/entities/OrderApproval';
import { RecurringOrder } from '../src/entities/RecurringOrder';
import { Payment } from '../src/entities/Payment';
import { Refund } from '../src/entities/Refund';
import { MomoStatement, MomoStatementLine } from '../src/entities/MomoStatement';
import { Shipment } from '../src/entities/Shipment';
import { ShippingZone } from '../src/entities/ShippingZone';
import { SellerLocation } from '../src/entities/SellerLocation';
import { ReturnRequest } from '../src/entities/ReturnRequest';
import { Dispute } from '../src/entities/Dispute';
import { Commission } from '../src/entities/Commission';
import { Quote } from '../src/entities/Quote';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';
import { PriceContract } from '../src/entities/PriceContract';
import { Catalog } from '../src/entities/Catalog';
import { CatalogProduct } from '../src/entities/CatalogProduct';
import { Promotion } from '../src/entities/Promotion';
import { Bundle } from '../src/entities/Bundle';
import { BundleItem } from '../src/entities/BundleItem';
import { PickList } from '../src/entities/PickList';
import { Review } from '../src/entities/Review';
import { Wishlist } from '../src/entities/Wishlist';
import { LoyaltyPoints } from '../src/entities/LoyaltyPoints';
import { Wallet } from '../src/entities/Wallet';
import { WalletTransaction } from '../src/entities/WalletTransaction';
import { WalletRecharge } from '../src/entities/WalletRecharge';
import { WalletWithdrawal } from '../src/entities/WalletWithdrawal';
import { Notification } from '../src/entities/Notification';
import { Message } from '../src/entities/Message';
import { ChatSession } from '../src/entities/ChatSession';
import { SearchHistory } from '../src/entities/SearchHistory';
import { Campaign, CampaignRecipient } from '../src/entities/Campaign';
import { ConsentLog } from '../src/entities/ConsentLog';
import { AuditLog } from '../src/entities/AuditLog';
import { TwoFactorAuth } from '../src/entities/TwoFactorAuth';
import { TaxConfig } from '../src/entities/TaxConfig';

const TARGET = 20;
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length - 1)];
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const daysAhead = (d: number) => new Date(Date.now() + d * 86400000);
const token = (n = 24) => crypto.randomBytes(n).toString('hex');
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');


/** Organisations n'ayant pas encore de ligne dans la table cible. */
async function orgsWithout(repo: any, take: number): Promise<Organization[]> {
  return AppDataSource.getRepository(Organization)
    .createQueryBuilder('o')
    .leftJoin(repo.metadata.tableName, 't', 't.org_id = o.id')
    .where('t.id IS NULL')
    .take(take)
    .getMany();
}

/** Users n'ayant pas encore de ligne dans la table cible (colonne user_id unique). */
async function usersWithout(repo: any, take: number): Promise<User[]> {
  const qb = AppDataSource.getRepository(User)
    .createQueryBuilder('u')
    .leftJoin(repo.metadata.tableName, 't', 't.user_id = u.id')
    .where('t.id IS NULL')
    .take(take);
  return qb.getMany();
}

async function count(repo: any): Promise<number> {
  return repo.count();
}
/** Crée `n` entités si le total actuel < TARGET, via factory. */
async function ensure(repo: any, make: (i: number, current: number) => any): Promise<any[]> {
  const current = await count(repo);
  if (current >= TARGET) return repo.find();
  const n = TARGET - current;
  const entities: any[] = [];
  for (let i = 0; i < n; i++) entities.push(make(i, current));
  try {
    return await repo.save(repo.create(entities));
  } catch {
    // Contrainte unique/violation sur l'insert groupé : on insère ligne par
    // ligne en ignorant les lignes en conflit.
    for (const e of entities) {
      try {
        await repo.save(repo.create(e));
      } catch (rowErr: any) {
        console.warn('   ↳', repo.metadata.name, 'ligne rejetée:', rowErr?.detail || rowErr?.message);
      }
    }
    const total = await count(repo);
    if (total < TARGET) console.warn('⚠️ ', repo.metadata.name, 'à', total, '/', TARGET);
    return repo.find();
  }
}

async function main() {
  await AppDataSource.initialize();
  console.log('📦 Seed démo — complétion vers ≥', TARGET, 'lignes / table\n');

  // ═══ 1. Référentiels ═════════════════════════════════════════
  const tiers = await ensure(AppDataSource.getRepository(OrgTier), (i) => ({
    name: pick(['Bronze', 'Silver', 'Gold', 'Platinum', 'VIP', 'Pro', 'Business', 'Elite']) + ' ' + (i + 1),
    discountRate: pick([0, 2.5, 5, 7.5, 10, 12.5, 15]),
    minOrderQty: rnd(1, 10),
    minOrderValue: rnd(0, 500000),
    canBuyWholesale: Math.random() > 0.4,
    canSell: Math.random() > 0.5,
  }));

  const orgs = await ensure(AppDataSource.getRepository(Organization), (i) => ({
    name: pick(['Pièces Auto Douala', 'Garage Centrale', 'Import Motors CM', 'Tokoto Spare Parts', 'Bafoussam Auto', 'Garé Auto', 'Nkolfoulou Pieces', 'Bonabéri Motors', 'Yaoundé Trading', 'Ekondo Titi Auto']) + ' ' + (i + 1),
    orgType: pick(['importer', 'wholesaler', 'retailer', 'garage'] as const),
    taxId: 'TAX' + String(1000000 + i),
    countryCode: 'CM',
    isVerified: Math.random() > 0.3,
    creditLimit: rnd(0, 20) * 500000,
    performanceScore: rnd(40, 100),
    performanceComputedAt: daysAgo(rnd(1, 30)),
    approvalThreshold: rnd(1, 10) * 250000,
    email: 'contact' + (i + 1) + '@org' + i + '.cm',
    phone: '+2376' + rnd(50000000, 99999999),
  }));

  const cats = await ensure(AppDataSource.getRepository(Category), (i, c) => {
    const parents = ['Freinage', 'Moteur', 'Filtration', 'Suspension', 'Électricité', 'Transmission', 'Carrosserie', 'Pneumatiques'];
    const children = ['Disques', 'Plaquettes', 'Huiles', 'Bougies', 'Filtres', 'Amortisseurs', 'Alternateurs', 'Courroies'];
    const name = c < 8 ? parents[i] : pick(children) + ' ' + (i + 1);
    return { name, slug: slug(name) + '-' + token(4), depth: c < 8 ? 0 : 1, isActive: true, parentId: c < 8 ? undefined : undefined };
  });

  const brands = await ensure(AppDataSource.getRepository(Brand), (i) => ({
    name: pick(['Bosch', 'Denso', 'Valeo', 'NGK', 'Mann Filter', 'Brembo', 'Monroe', 'Sachs', 'Febi', 'SKF', 'Mahle', 'Pierburg']) + ' ' + (i + 1),
    countryOfOrigin: pick(['DE', 'JP', 'FR', 'US', 'CN', 'KR']),
    isOem: Math.random() > 0.4,
    isActive: true,
  }));

  // ═══ 2. Utilisateurs ═════════════════════════════════════════
  const firstNames = ['Jean', 'Marie', 'Paul', 'Estelle', 'Eric', 'Clarisse', 'Samuel', 'Diane', 'Patrick', 'Sandrine', 'Blaise', 'Nadège'];
  const lastNames = ['Dupont', 'Mbarga', 'Etoundi', 'Ngo Bell', 'Fotso', 'Tchoumi', 'Atangana', 'Kamdem', 'Nkoulou', 'Bello', 'Essomba', 'Onana'];
  const passwordHash = await bcrypt.hash('Test1234!', 10);
  const users = await ensure(AppDataSource.getRepository(User), (i, c) => ({
    email: c < 3 ? ['buyer@test.cm', 'seller@test.cm', 'admin@test.cm'][i] : pick(['jean', 'marie', 'paul', 'estelle', 'eric', 'samuel', 'diane']) + (i + c) + '@mail.cm',
    passwordHash,
    firstName: pick(firstNames),
    lastName: pick(lastNames),
    accountType: pick(['individual', 'pro'] as const),
    roles: (c === 0 || i + c === 0) ? ['buyer'] : (c === 1 || i + c === 1) ? ['seller', 'org_admin'] : (c === 2 || i + c === 2) ? ['super_admin'] : pick([['buyer'], ['buyer'], ['seller'], ['org_admin'], ['logistics'], ['accountant']] as any),
    isVerified: Math.random() > 0.15,
    isActive: true,
    orgId: Math.random() > 0.5 ? pick(orgs).id : undefined,
    lastLoginAt: daysAgo(rnd(0, 30)),
  }));

  const buyerU = users.filter((u) => (u.roles as string[]).includes('buyer'));
  const sellerU = users.filter((u) => (u.roles as string[]).some((r) => ['seller', 'org_admin'].includes(r)));
  const adminU = users.filter((u) => (u.roles as string[]).includes('super_admin'));
  const allOrgs: Organization[] = orgs;

  await ensure(AppDataSource.getRepository(Address), (i) => ({
    user: pick(users),
    label: pick(['Maison', 'Bureau', 'Garage', 'Dépôt']),
    street: pick(['Rue de la Joie', 'Boulevard de la Liberté', 'Avenue Kennedy', 'Carrefour Nkolbisson', 'Rue Njo-Njo']) + ', ' + rnd(1, 200),
    city: pick(['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Bamenda', 'Limbe']),
    postalCode: String(rnd(1000, 9999)),
    countryCode: 'CM',
    isDefault: i < 4,
  }));

  // ═══ 3. Catalogue ════════════════════════════════════════════
  const partNames = ['Disque de frein avant', 'Plaquettes de frein céramique', 'Filtre à huile', 'Filtre à air', 'Bougie d\u2019allumage iridium', 'Amortisseur avant', 'Alternateur reconditionné', 'Courroie de distribution', 'Kit d\u2019embrayage', 'Pompe à eau', 'Radiateur de refroidissement', 'Démarreur', 'Balai d\u2019essuie-glace', 'Battery 12V 70Ah', 'Phare avant gauche', 'Rétroviseur droit', 'Capteur ABS', 'Joint de culasse', 'Turbo reconditionné', 'Boîtier de filtre'];
  const products = await ensure(AppDataSource.getRepository(Product), (i) => {
    const cat = pick(cats); const brand = pick(brands);
    const name = partNames[i % partNames.length] + (i >= partNames.length ? ' ' + (i + 1) : '');
    return {
      sku: 'SKU-' + String(10000 + i),
      oemReference: 'OEM-' + String(500000 + rnd(0, 99999)),
      name,
      description: name + ' — pièce de qualité pour véhicules circulant au Cameroun. Garantie constructeur.',
      categoryId: cat.id, brandId: brand.id,
      basePrice: rnd(5, 400) * 1000,
      currency: 'XAF',
      condition: pick(['new', 'new', 'new', 'genuine_used', 'reconditioned'] as const),
      weightKg: rnd(1, 20),
      dimensionsCm: { length: rnd(10, 60), width: rnd(5, 40), height: rnd(5, 30) },
      isActive: true,
      // Storefront : la majorité du catalogue est publique ;
      // ~10 % réservé B2B (invisible en invité) pour la démo de la règle.
      publicListing: i % 10 !== 7,
      orgId: pick(orgs).id,
    };
  });

  const variants = await ensure(AppDataSource.getRepository(ProductVariant), (i) => {
    const p = products[i % products.length];
    return {
      variantSku: 'VAR-' + String(100000 + i),
      attributes: { position: pick(['avant', 'arrière', 'gauche', 'droite']), diametre: rnd(200, 400) + 'mm' },
      costPrice: rnd(3, 300) * 1000,
      priceOverride: Math.random() > 0.5 ? rnd(4, 350) * 1000 : null,
      reorderPoint: rnd(2, 15),
      isActive: true,
      product: p,
    };
  });

  // Visuels produits : SVG locaux servis par /uploads (aucune dépendance
  // internet) — l'entité n'a que `url` + `sizes` (jsonb thumb/medium/large).
  const IMAGE_SLUGS: Record<string, string> = {
    'Disques de frein': 'disques-frein',
    Plaquettes: 'plaquettes',
    Filtres: 'filtres',
    Batterie: 'batterie',
    Amortisseurs: 'amortisseurs',
    Courroie: 'courroie',
    Moteur: 'moteur',
  };
  const catById = new Map(cats.map((c: any) => [c.id, c]));
  await ensure(AppDataSource.getRepository(ProductImage), (i) => {
    const p = products[i % products.length];
    const slug = IMAGE_SLUGS[catById.get(p.categoryId)?.name ?? ''] ?? 'moteur';
    const url = `/uploads/products/${slug}-v2.svg`;
    return {
      product: p,
      url,
      sizes: { thumb: url, medium: url, large: url },
      altText: p.name,
      isPrimary: true,
      sortOrder: 0,
    };
  });

  const MAKES = [['Toyota', ['Hilux', 'Corolla', 'Land Cruiser', 'Yaris', 'RAV4']], ['Mercedes', ['Classe C', 'Sprinter', 'Actros', 'Vito']], ['Peugeot', ['208', '301', 'Partner', 'Boxer']], ['Nissan', ['Navara', 'Patrol', 'X-Trail']], ['Mitsubishi', ['L200', 'Pajero']], ['Hyundai', ['Tucson', 'i10', 'H1']], ['Ford', ['Ranger', 'Transit']], ['Volkswagen', ['Golf', 'Passat', 'Transporter']]] as [string, string[]][];
  await ensure(AppDataSource.getRepository(ProductCompatibility), (i) => {
    const [make, models] = MAKES[i % MAKES.length];
    const y1 = rnd(2005, 2018);
    return { product: pick(products), make, model: pick(models), yearFrom: y1, yearTo: Math.min(y1 + rnd(2, 8), 2026), engineCode: pick(['1KD-FTV', '2ZR-FE', 'OM651', 'DV6', 'K9K', '4N15', null]) ?? undefined };
  });

  // ═══ 4. Stock ════════════════════════════════════════════════
  const warehouses = await ensure(AppDataSource.getRepository(Warehouse), (i) => ({
    name: pick(['Entrepôt Principal', 'Dépôt Bonabéri', 'Plateau Bascal', 'Akwa Store', 'Nkolbisson WH', 'Bafoussam Depot', 'Garoua North', 'Limbe Port']) + ' ' + (i + 1),
    orgId: pick(allOrgs).id,
    countryCode: 'CM',
    city: pick(['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Limbe']),
    address: 'Zone industrielle, ' + pick(['Bonabéri', 'Bassel', 'Nkolbisson', 'Rouba']) + ' ' + rnd(1, 100),
    isActive: true,
  }));

  const stockLevels = await ensure(AppDataSource.getRepository(StockLevel), (i) => {
    const v = variants[i % variants.length];
    const wh = warehouses[i % warehouses.length];
    const onHand = rnd(0, 120);
    return { warehouse: wh, variant: v, qtyOnHand: onHand, qtyReserved: Math.min(rnd(0, 10), onHand), lastUpdatedAt: daysAgo(rnd(0, 10)) };
  });

  await ensure(AppDataSource.getRepository(StockMovement), (i) => {
    const v = variants[i % variants.length];
    const wh = warehouses[i % warehouses.length];
    const delta = pick([-10, -5, -3, -2, -1, 5, 10, 20, 50]);
    return {
      variantId: v.id, warehouseId: wh.id,
      reason: pick(['purchase', 'sale', 'return', 'damage', 'correction', 'transfer_in', 'transfer_out', 'reservation', 'release'] as const),
      qtyDelta: delta, qtyBefore: rnd(20, 100), qtyAfter: rnd(20, 100),
      userId: pick(users).id,
      createdAt: daysAgo(rnd(0, 90)),
    };
  });

  await ensure(AppDataSource.getRepository(StockAudit), (i) => {
    const status = pick(['planned', 'in_progress', 'completed', 'cancelled'] as const);
    const done = status === 'completed';
    return {
      warehouse: pick(warehouses), conductedBy: pick(sellerU.length ? sellerU : users),
      status, plannedDate: daysAgo(rnd(1, 60)), completedDate: done ? daysAgo(rnd(0, 30)) : null,
      results: done ? [1, 2, 3].map(() => { const v = pick(variants); return { variantId: v.id, sku: v.variantSku, expected: rnd(10, 90), counted: rnd(8, 95), diff: rnd(-5, 5) }; }) : null,
      notes: done ? 'Écart constaté sur ' + rnd(1, 3) + ' référence(s)' : null,
    };
  });

  await ensure(AppDataSource.getRepository(StockForecast), (i) => {
    const v = variants[i % variants.length];
    return { variantId: v.id, orgId: pick(allOrgs).id!, horizonDays: pick([30, 60, 90]), avgDailySales: rnd(5, 400) / 100, forecastQty: rnd(20, 400), availableQty: rnd(0, 150), reorderPoint: rnd(5, 30), recommendedReorderQty: rnd(10, 200) };
  });

  // ═══ 5. Commandes & paiements ════════════════════════════════
  const addresses = AppDataSource.getRepository(Address);
  const orders: Order[] = await ensure(AppDataSource.getRepository(Order), (i) => {
    const subtotal = rnd(10, 600) * 1000;
    const tax = Math.round(subtotal * 0.1925);
    const ship = pick([0, 1500, 2500, 5000]);
    return {
      orderNumber: 'CMD-' + String(20260000 + i),
      buyer: pick(buyerU.length ? buyerU : users),
      sellerOrg: pick(allOrgs),
      status: pick(['draft', 'confirmed', 'confirmed', 'processing', 'shipped', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled', 'refunded'] as const),
      channel: pick(['b2b', 'b2c', 'b2c', 'marketplace'] as const),
      subtotal, taxAmount: tax, shippingCost: ship, discountAmount: pick([0, 0, 0, rnd(1, 10) * 1000]),
      totalAmount: subtotal + tax + ship,
      currency: 'XAF',
      notes: Math.random() > 0.7 ? 'Livrer avant 17h, appeler en arrivant.' : null,
      shippingAddressId: null, billingAddressId: null,
      orderedAt: daysAgo(rnd(0, 330)),
    };
  });

  // Biais démo : la majorité des ventes porte sur l'org du vendeur test
  const sellerTest = await AppDataSource.getRepository(User).findOneBy({ email: 'seller@test.cm' });
  if (sellerTest) {
    const sellerOrgId = sellerTest.orgId ?? allOrgs[0].id;
    if (!sellerTest.orgId) await AppDataSource.getRepository(User).update(sellerTest.id, { orgId: sellerOrgId });
    const ids = orders.map((o) => o.id);
    for (let k = 0; k < ids.length; k++) {
      if (k % 5 === 0) continue; // 20 % restent répartis sur les autres orgs
      await AppDataSource.getRepository(Order).update(ids[k], { sellerOrg: { id: sellerOrgId } as any });
    }
    // Répartition temporelle réaliste (les analytics groupent sur ordered_at)
    await AppDataSource.query(
      "UPDATE orders SET ordered_at = NOW() - (random() * INTERVAL '330 days') WHERE order_number LIKE 'CMD-%'",
    );
  }

  // Les lignes précédentes ont un variant_id null (scalaire ignoré) : on les recrée avec la relation.
  await AppDataSource.query('DELETE FROM order_lines');
  await ensure(AppDataSource.getRepository(OrderLine), (i) => {
    const o = orders[i % orders.length];
    const v = pick(variants);
    const qty = rnd(1, 5); const unit = rnd(5, 300) * 1000;
    return { order: o, variant: v, productSnapshot: { name: v.product?.name ?? 'Pièce', sku: v.variantSku, variantId: v.id }, quantity: qty, unitPrice: unit, lineTotal: qty * unit, taxRate: 19.25 };
  });

  const payments = await ensure(AppDataSource.getRepository(Payment), (i) => {
    const o = orders[i % orders.length];
    const method = pick(['mobile_money', 'mobile_money', 'mobile_money', 'bank_transfer', 'cash', 'credit', 'card'] as const);
    const status = method === 'mobile_money' ? pick(['completed', 'completed', 'pending', 'failed'] as const) : pick(['completed', 'pending', 'completed'] as const);
    return {
      order: o, method, status,
      amount: o.totalAmount ?? rnd(20, 700) * 1000, currency: 'XAF',
      gatewayRef: 'PAY-' + token(8).toUpperCase(),
      gatewayResponse: { provider: pick(['mtn', 'orange', null]) },
      paidAt: status === 'completed' ? daysAgo(rnd(0, 180)) : null,
      createdAt: daysAgo(rnd(0, 330)),
    };
  });

  await ensure(AppDataSource.getRepository(Refund), (i) => {
    const p = payments[i % payments.length];
    return { payment: p, processedBy: pick(adminU.length ? adminU : users), amount: Math.round((p.amount ?? 50000) * 0.5), method: pick(['momo', 'bank_transfer', 'wallet'] as const), status: pick(['pending', 'processing', 'completed', 'failed', 'pending_manual'] as const), reason: pick(['Produit défectueux', 'Commande annulée par le client', 'Erreur de livraison', 'Double paiement']), gatewayRef: 'REF-' + token(6).toUpperCase(), createdAt: daysAgo(rnd(0, 120)) };
  });

  // ═══ 6. Livraison / retours / litiges ════════════════════════
  await ensure(AppDataSource.getRepository(ShippingZone), (i) => ({
    org: pick(allOrgs),
    name: pick(['Douala', 'Yaoundé', 'Intérieur', 'International', 'Express']) + (i >= 5 ? ' Zone ' + (i + 1) : ''),
    zoneType: pick(['city', 'city', 'national', 'international'] as const),
    flatRate: rnd(0, 8) * 500, ratePerKg: rnd(0, 4) * 250,
    freeThreshold: Math.random() > 0.4 ? rnd(10, 100) * 1000 : null,
    estimatedDays: rnd(1, 10), isExpress: Math.random() > 0.7,
    expressSurchargePct: pick([0, 10, 20, 30]), isActive: true,
  }));

  const shipments = await ensure(AppDataSource.getRepository(Shipment), (i) => {
    const status = pick(['preparing', 'in_transit', 'out_for_delivery', 'delivered', 'delivered', 'returned'] as const);
    return {
      order: orders[i % orders.length], warehouse: pick(warehouses),
      trackingNumber: pick(['CP', 'DHL', 'EU', 'UPS']) + String(rnd(100000000, 999999999)),
      carrier: pick(['Campost', 'DHL', 'Express Union', 'UPS', 'Livraison propre']),
      status, shippedAt: status !== 'preparing' ? daysAgo(rnd(1, 60)) : null,
      deliveredAt: status === 'delivered' ? daysAgo(rnd(0, 30)) : null,
      pickupCode: Math.random() > 0.7 ? String(rnd(1000, 9999)) : null,
    };
  });

  await ensure(AppDataSource.getRepository(PickList), (i) => {
    const status = pick(['pending', 'in_progress', 'completed', 'cancelled'] as const);
    const v = pick(variants);
    return { order: pick(orders), warehouse: pick(warehouses), picker: status !== 'pending' ? pick(sellerU.length ? sellerU : users) : null, status, items: [{ variantId: v.id, sku: v.variantSku, qty: rnd(1, 6), location: 'R' + rnd(1, 20) + '-' + rnd(1, 40), pickedAt: status === 'completed' ? daysAgo(rnd(0, 20)) : undefined }], startedAt: status !== 'pending' ? daysAgo(rnd(1, 30)) : null, completedAt: status === 'completed' ? daysAgo(rnd(0, 25)) : null };
  });

  await ensure(AppDataSource.getRepository(ReturnRequest), (i) => {
    const status = pick(['requested', 'approved', 'rejected', 'shipped_back', 'received', 'refunded'] as const);
    const v = pick(variants);
    return { order: pick(orders), requester: pick(buyerU.length ? buyerU : users), status, reason: pick(['defective', 'wrong_item', 'not_as_described', 'changed_mind', 'damaged_shipping', 'other'] as const), description: 'Demande de retour pour le produit ' + v.variantSku, lines: [{ variantId: v.id, quantity: rnd(1, 3) }], returnTracking: status !== 'requested' ? 'RET' + rnd(100000, 999999) : null, refundAmount: ['approved', 'received', 'refunded'].includes(status) ? rnd(5, 200) * 1000 : null };
  });

  await ensure(AppDataSource.getRepository(Dispute), (i) => {
    const status = pick(['open', 'under_review', 'resolved_buyer', 'resolved_seller', 'closed'] as const);
    return { order: pick(orders), claimant: pick(buyerU.length ? buyerU : users), assignedTo: status !== 'open' ? pick(adminU.length ? adminU : users) : null, status, type: pick(['not_received', 'wrong_item', 'quality', 'payment', 'other'] as const), description: pick(['Produit non conforme à la commande.', 'Colis jamais reçu malgré le suivi.', 'Pièce défectueée à la réception.', 'Paiement débité deux fois.']), resolutionNotes: status.startsWith('resolved') || status === 'closed' ? 'Remboursement partiel accordé après arbitrage.' : null, evidenceUrls: null };
  });

  // ═══ 7. B2B ══════════════════════════════════════════════════
  await ensure(AppDataSource.getRepository(Quote), (i) => {
    const sub = rnd(50, 900) * 1000; const disc = pick([0, 2.5, 5, 10]);
    return { quoteNumber: 'DEV-' + String(20260000 + i), buyer: pick(buyerU.length ? buyerU : users), sellerOrg: pick(allOrgs), status: pick(['draft', 'sent', 'sent', 'accepted', 'rejected', 'expired', 'converted'] as const), validUntil: daysAhead(rnd(-30, 60)), subtotal: sub, discountPct: disc, totalAmount: Math.round(sub * (1 - disc / 100)), currency: 'XAF', notes: 'Devis sur grille tarifaire ' + pick(tiers).name, lines: [1, 2].map(() => { const v = pick(variants); return { variantId: v.id, sku: v.variantSku, quantity: rnd(2, 30), unitPrice: rnd(5, 200) * 1000 }; }) };
  });

  await ensure(AppDataSource.getRepository(PurchaseOrder), (i) => {
    const lines = [1, 2, 3].map(() => { const v = pick(variants); return { variantId: v.id, sku: v.variantSku, quantityOrdered: rnd(10, 100), quantityReceived: rnd(0, 100), unitCost: rnd(3, 150) * 1000 }; });
    return { poNumber: 'BC-' + String(20260000 + i), buyerOrg: pick(allOrgs), supplierName: pick(['Sungwoo Auto', 'Guangzhou Parts Co', 'Dubai Motor Spares', 'Europe Auto Export']), supplierEmail: 'supply' + i + '@supplier.example', warehouse: pick(warehouses), createdBy: pick(sellerU.length ? sellerU : users), status: pick(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'] as const), lines, totalAmount: lines.reduce((s, l) => s + l.quantityOrdered * l.unitCost, 0), currency: 'XAF', expectedAt: daysAhead(rnd(-20, 60)), notes: null };
  });

  await ensure(AppDataSource.getRepository(PriceContract), (i) => ({ buyerOrg: pick(allOrgs), sellerOrg: pick(allOrgs), variant: pick(variants), contractedPrice: rnd(3, 250) * 1000, minQty: rnd(5, 50), maxQty: Math.random() > 0.5 ? rnd(100, 1000) : null, currency: 'XAF', validFrom: daysAgo(rnd(5, 60)), validUntil: daysAhead(rnd(10, 180)) }));

  await ensure(AppDataSource.getRepository(Promotion), (i) => ({
    code: 'PROMO' + String(100 + i),
    name: pick(['Remise Freelance', 'Promo Fête', 'Soldes Stock', 'Pack Garage', 'Back-to-school', 'Promo Express']) + ' ' + (i + 1),
    type: pick(['percentage', 'percentage', 'fixed', 'free_shipping', 'bogo'] as const),
    scope: pick(['all', 'all', 'category', 'product', 'org'] as const),
    discountValue: rnd(5, 30),
    minOrderAmount: rnd(0, 30) * 1000,
    maxUses: rnd(50, 500), usesCount: rnd(0, 50),
    maxUsesPerUser: rnd(1, 5),
    validFrom: daysAgo(rnd(10, 60)), validUntil: daysAhead(rnd(5, 90)),
    isActive: Math.random() > 0.25,
  }));

  const bundles = await ensure(AppDataSource.getRepository(Bundle), (i) => ({ name: pick(['Kit Freinage Complet', 'Kit Distribution', 'Pack Filtration Entretien', 'Kit Embrayage', 'Pack Batterie + Durites']) + ' ' + (i + 1), description: 'Kit économique : pièces complémentaires vendues ensemble.', bundlePrice: rnd(30, 500) * 1000, currency: 'XAF', isActive: Math.random() > 0.2 }));
  await ensure(AppDataSource.getRepository(BundleItem), (i) => ({ bundle: bundles[i % bundles.length], variant: pick(variants), quantity: rnd(1, 4) }));

  await ensure(AppDataSource.getRepository(Commission), (i) => {
    const o = orders[i % orders.length];
    const rate = rnd(5, 15); const base = o.subtotal ?? rnd(50, 500) * 1000;
    return { order: o, sellerOrg: pick(allOrgs), ratePct: rate, baseAmount: base, commissionAmount: Math.round(base * rate / 100), currency: 'XAF', status: pick(['pending', 'validated', 'paid', 'cancelled'] as const), paidAt: null };
  });

  await ensure(AppDataSource.getRepository(OrderApproval), (i) => {
    const status = pick(['pending', 'approved', 'rejected'] as const);
    return { order: pick(orders), approver: status !== 'pending' ? pick(adminU.length ? adminU : users) : null, status, reason: status === 'approved' ? 'Crédit vérifié' : status === 'rejected' ? 'Crédit insuffisant' : null, thresholdAmount: rnd(2, 10) * 250000, decidedAt: status !== 'pending' ? daysAgo(rnd(0, 30)) : null, createdAt: daysAgo(rnd(1, 60)) };
  });

  await ensure(AppDataSource.getRepository(RecurringOrder), (i) => ({ buyer: pick(buyerU.length ? buyerU : users), sellerOrg: pick(allOrgs), name: 'Réappro mensuel ' + pick(['huiles', 'filtres', 'plaquettes', 'bougies']) + ' #' + (i + 1), frequency: pick(['daily', 'weekly', 'biweekly', 'monthly'] as const), template: { lines: [{ variantId: pick(variants).id, quantity: rnd(2, 20) }] }, nextRunAt: daysAhead(rnd(1, 30)), isActive: Math.random() > 0.3, billingAddressId: null }));

  // ═══ 8. Avis / QA / wishlist / événements ════════════════════
  await ensure(AppDataSource.getRepository(Review), (i) => ({
    reviewer: users[(i * 5) % users.length], product: products[i % products.length], order: pick(orders),
    rating: pick([5, 5, 5, 4, 4, 3, 2, 1]),
    comment: pick(['Excellent produit, livraison rapide à Douala.', 'Bonne qualité, correspond à la description.', 'Pièce conforme, installée sans souci sur mon Hilux.', 'Correct mais emballage abîmé.', 'Délai un peu long, produit OK.', 'Parfait, je recommande ce vendeur.']),
    isVerifiedPurchase: Math.random() > 0.3,
    status: pick(['approved', 'approved', 'approved', 'pending', 'rejected'] as const),
    sellerReply: Math.random() > 0.6 ? 'Merci pour votre retour, au plaisir de vous revoir !' : null,
    sellerRepliedAt: Math.random() > 0.6 ? daysAgo(rnd(0, 30)) : null,
    createdAt: daysAgo(rnd(0, 200)),
  }));

  await ensure(AppDataSource.getRepository(ProductQA), (i) => ({
    product: pick(products), asker: pick(buyerU.length ? buyerU : users), answerer: Math.random() > 0.4 ? pick(sellerU.length ? sellerU : users) : null,
    question: pick(['Est-ce compatible avec un Toyota Hilux 2018 ?', 'Cette pièce est-elle d\u2019origine ou adaptable ?', 'Quelles sont les dimensions exactes ?', 'Livrez-vous à Bafoussam ?', 'Y a-t-il une garantie ?']),
    answer: Math.random() > 0.4 ? pick(['Oui, compatible Hilux 2015-2020.', 'C\u2019est de l\u2019adaptatif de qualité OEM.', 'Les dimensions sont dans la fiche technique.', 'Oui, nous livrons dans tout le Cameroun.']) : null,
    isPublic: true, answeredAt: Math.random() > 0.4 ? daysAgo(rnd(0, 30)) : null, createdAt: daysAgo(rnd(0, 90)),
  }));

  const wUsers = buyerU.length ? buyerU : users;
  await ensure(AppDataSource.getRepository(Wishlist), (i) => ({
    user: wUsers[i % wUsers.length],
    product: products[(i + Math.floor(i / wUsers.length)) % products.length],
    note: Math.random() > 0.7 ? 'À commander le mois prochain' : null,
    priceAtAdd: rnd(5, 300) * 1000, wasInStock: Math.random() > 0.3, createdAt: daysAgo(rnd(0, 120)),
  }));

  await ensure(AppDataSource.getRepository(ProductEvent), (i) => ({ product: pick(products), user: pick(users), type: pick(['view', 'view', 'view', 'cart', 'purchase'] as const), createdAt: daysAgo(rnd(0, 90)) }));

  await ensure(AppDataSource.getRepository(PriceHistory), (i) => ({ product: products[i % products.length], changedBy: pick(sellerU.length ? sellerU : users), oldPrice: rnd(5, 300) * 1000, newPrice: rnd(5, 300) * 1000, currency: 'XAF', reason: pick(['Mise à jour manuelle', 'Révision tarifaire trimestre', 'Promotion', 'Alignement marché']), changedAt: daysAgo(rnd(0, 300)) }));

  // ═══ 9. Wallet / fidélité ════════════════════════════════════
  const walletRepo = AppDataSource.getRepository(Wallet);
  const walletShort = Math.max(0, TARGET - await count(walletRepo));
  const usersNoWallet = walletShort > 0 ? await usersWithout(walletRepo, walletShort) : [];
  const wallets = await ensure(AppDataSource.getRepository(Wallet), (i) => ({
    user: usersNoWallet[i] ?? users[(i + walletShort) % users.length],
    balance: rnd(0, 400) * 1000, currency: 'XAF', isActive: true,
  }));
  await ensure(AppDataSource.getRepository(WalletTransaction), (i) => { const w = wallets[i % wallets.length]; const amt = rnd(1, 100) * 1000; return { wallet: w, order: pick(orders), type: pick(['credit', 'debit', 'refund', 'adjustment'] as const), amount: amt, balanceAfter: (w.balance ?? 0) + rnd(-50, 50) * 1000, description: pick(['Paiement commande', 'Remboursement', 'Recharge Mobile Money', 'Ajustement comptable']), reference: 'WT-' + token(5).toUpperCase(), createdAt: daysAgo(rnd(0, 150)) }; });
  await ensure(AppDataSource.getRepository(WalletRecharge), (i) => ({ user: users[i % users.length], amount: rnd(5, 200) * 1000, currency: 'XAF', provider: pick(['mtn', 'orange'] as const), phone: '+2376' + rnd(50000000, 99999999), gatewayRef: 'RCH-' + token(8).toUpperCase(), status: pick(['pending', 'completed', 'completed', 'failed'] as const), processedAt: Math.random() > 0.3 ? daysAgo(rnd(0, 60)) : null }));
  await ensure(AppDataSource.getRepository(WalletWithdrawal), (i) => ({ user: users[i % users.length], processedBy: Math.random() > 0.4 ? pick(adminU.length ? adminU : users) : null, amount: rnd(5, 150) * 1000, currency: 'XAF', phone: '+2376' + rnd(50000000, 99999999), status: pick(['pending', 'approved', 'rejected', 'paid', 'failed'] as const), rejectionReason: null, gatewayRef: 'WDR-' + token(6).toUpperCase() }));
  await ensure(AppDataSource.getRepository(LoyaltyPoints), (i) => { const pts = pick([50, 100, 150, 200, 500, -100]); return { user: pick(users), order: pick(orders), type: pick(['earned', 'earned', 'redeemed', 'expired', 'bonus', 'adjustment'] as const), points: pts, balanceAfter: rnd(100, 3000), description: pts > 0 ? 'Points gagnés sur commande' : 'Points utilisés', expiresAt: daysAhead(rnd(30, 365)), createdAt: daysAgo(rnd(0, 200)) }; });

  // ═══ 10. Communication ═══════════════════════════════════════
  await ensure(AppDataSource.getRepository(Notification), (i) => ({ user: users[i % users.length], type: pick(['order_update', 'order_update', 'stock_alert', 'payment', 'promo', 'system'] as const), title: pick(['Commande expédiée', 'Paiement reçu', 'Stock faible détecté', 'Promo du week-end', 'Bienvenue sur AutoParts']), body: 'Détails de la notification ' + (i + 1) + '.', payload: { index: i }, isRead: Math.random() > 0.4, createdAt: daysAgo(rnd(0, 60)) }));
  await ensure(AppDataSource.getRepository(Message), (i) => { const s = pick(users); let r = pick(users); if (r.id === s.id) r = users[(users.indexOf(r) + 1) % users.length]; return { sender: s, recipient: r, order: Math.random() > 0.5 ? pick(orders) : null, subject: Math.random() > 0.5 ? pick(['Question commande', 'Disponibilité pièce', 'Délai de livraison']) : null, body: pick(['Bonjour, ma commande est-elle expédiée ?', 'Avez-vous cette référence en stock ?', 'Quand recevrai-je le colis à Yaoundé ?', 'Merci pour la facture !']), isRead: Math.random() > 0.5, attachments: null, createdAt: daysAgo(rnd(0, 60)) }; });
  await ensure(AppDataSource.getRepository(ChatSession), (i) => ({ user: users[i % users.length], sessionKey: 'seed-session-' + token(10), createdAt: daysAgo(rnd(0, 60)) }));
  await ensure(AppDataSource.getRepository(SearchHistory), (i) => ({ user: Math.random() > 0.3 ? pick(users) : null, sessionId: null, query: pick(['disque de frein hilux', 'filtre à huile corolla', 'bougie ngk', 'amortisseur navara', 'OEM 04465-0K360', 'batterie 70ah', 'courroie distribution sprinter']), resultsCount: rnd(0, 40), searchType: pick(['text', 'oem', 'vehicle', 'barcode']), filters: null, searchedAt: daysAgo(rnd(0, 90)) }));

  const campaigns = await ensure(AppDataSource.getRepository(Campaign), (i) => ({ subject: pick(['Promotions du mois', 'Nouveautés catalogue', 'Soldes fin de saison', 'Offres garages partenaires', 'Newsletter AutoParts']) + ' #' + (i + 1), body: 'Bonjour, découvrez nos offres du moment sur les pièces auto. Prix TTC en FCFA.', audience: pick(['all', 'buyers', 'sellers', 'inactive']), status: pick(['draft', 'sent', 'sent', 'scheduled']), sentAt: Math.random() > 0.4 ? daysAgo(rnd(0, 90)) : null }));
  await ensure(AppDataSource.getRepository(CampaignRecipient), (i) => ({ campaign: campaigns[i % campaigns.length], user: Math.random() > 0.3 ? pick(users) : null, email: 'dest' + i + '@mail.cm', token: token(16), openedAt: Math.random() > 0.5 ? daysAgo(rnd(0, 30)) : null, clickedAt: Math.random() > 0.7 ? daysAgo(rnd(0, 20)) : null, unsubscribedAt: Math.random() > 0.85 ? daysAgo(rnd(0, 10)) : null }));

  // ═══ 11. Conformité / org ════════════════════════════════════
  await ensure(AppDataSource.getRepository(OrgInvitation), (i) => ({ org: pick(allOrgs), email: 'invite' + i + '@mail.cm', role: pick(['org_admin', 'seller', 'buyer', 'logistics', 'accountant'] as const), token: token(16), status: pick(['pending', 'pending', 'accepted', 'expired', 'revoked'] as const), expiresAt: daysAhead(rnd(-10, 30)) }));
  await ensure(AppDataSource.getRepository(OrgDocument), (i) => ({ org: pick(allOrgs), type: pick(['rccm', 'patente', 'statuts', 'id_card'] as const), fileUrl: '/uploads/docs/doc-' + (i + 1) + '.pdf', originalName: 'document-' + (i + 1) + '.pdf', uploadedBy: pick(users).id, status: pick(['pending', 'approved', 'rejected'] as const), reviewedBy: Math.random() > 0.4 ? pick(adminU.length ? adminU : users).id : null, reviewedAt: Math.random() > 0.4 ? daysAgo(rnd(0, 30)) : null }));
  const slRepo = AppDataSource.getRepository(SellerLocation);
  const slShort = Math.max(0, TARGET - await count(slRepo));
  const orgsNoLoc = slShort > 0 ? await orgsWithout(slRepo, slShort) : [];
  await ensure(AppDataSource.getRepository(SellerLocation), (i) => ({ org: orgsNoLoc[i] ?? pick(allOrgs), latitude: pick([4.0511, 4.0837, 3.8667, 5.4597, 9.3017]) + rnd(-50, 50) / 10000, longitude: pick([9.7679, 9.7043, 11.5167, 10.4183, 13.4333]) + rnd(-50, 50) / 10000, address: 'Zone ' + pick(['Akwa', 'Bonabéri', 'Bassel', 'Dla', 'Ydé']) + ' ' + rnd(1, 50), city: pick(['Douala', 'Yaoundé', 'Bafoussam', 'Garoua']), isVisible: true, categories: null }));
  await ensure(AppDataSource.getRepository(ConsentLog), (i) => ({ user: users[i % users.length], type: pick(['cgv', 'rgpd', 'marketing']), version: '1.' + rnd(0, 3), accepted: Math.random() > 0.15, ip: '41.202.' + rnd(1, 254) + '.' + rnd(1, 254), createdAt: daysAgo(rnd(0, 200)) }));
  await ensure(AppDataSource.getRepository(AuditLog), (i) => ({ actor: Math.random() > 0.2 ? pick(users) : null, actorEmail: 'audit' + i + '@mail.cm', actorRoles: ['super_admin'], action: pick(['LOGIN', 'PRICE_CHANGE', 'ORDER_STATUS_CHANGE', 'STOCK_ADJUST', 'ROLE_UPDATE', 'PRODUCT_DELETE']), entity: pick(['user', 'order', 'product', 'stock_level', 'payment']), entityId: pick(users).id, before: { value: rnd(10, 100) }, after: { value: rnd(10, 100) }, ipAddress: '41.202.' + rnd(1, 254) + '.' + rnd(1, 254), userAgent: 'seed-script', createdAt: daysAgo(rnd(0, 90)) }));
  const tfaRepo = AppDataSource.getRepository(TwoFactorAuth);
  const tfaShort = Math.max(0, TARGET - await count(tfaRepo));
  const usersNoTfa = tfaShort > 0 ? await usersWithout(tfaRepo, tfaShort) : [];
  await ensure(AppDataSource.getRepository(TwoFactorAuth), (i) => ({
    userId: (usersNoTfa[i] ?? users[(i + tfaShort) % users.length]).id,
    secret: token(16).toUpperCase(), isEnabled: false, backupCodes: [],
  }));
  // 20 pays avec TVA réelle (contrainte UNIQUE(country_code) sur la table)
  const VAT = [
    ['CM', 0.1925], ['FR', 0.20], ['DE', 0.19], ['GB', 0.20], ['NG', 0.075],
    ['GH', 0.15], ['CI', 0.18], ['SN', 0.18], ['ML', 0.18], ['BF', 0.18],
    ['TG', 0.18], ['BJ', 0.18], ['GA', 0.18], ['CG', 0.189], ['AO', 0.14],
    ['CD', 0.16], ['CF', 0.19], ['TD', 0.18], ['GQ', 0.15], ['MA', 0.20],
    ['TN', 0.19], ['DZ', 0.19], ['LU', 0.17], ['IT', 0.22], ['ES', 0.21],
    ['PT', 0.23], ['BE', 0.21], ['NL', 0.21], ['CH', 0.081], ['CA', 0.05],
  ];
  await ensure(AppDataSource.getRepository(TaxConfig), (i, current) => ({
    countryCode: VAT[(current + i) % VAT.length][0],
    rate: VAT[(current + i) % VAT.length][1],
    isActive: true,
    exemptedCategoryIds: [],
  }));

  // MomoStatement + lignes
  const statements = await ensure(AppDataSource.getRepository(MomoStatement), (i) => ({ provider: pick(['mtn', 'orange']), periodLabel: '2026-' + String(((i % 12) + 1)).padStart(2, '0'), fileName: 'statement-' + i + '.csv', importedBy: pick(adminU.length ? adminU : users), lineCount: rnd(50, 400), matchedCount: rnd(40, 380), createdAt: daysAgo(rnd(0, 300)) }));
  await ensure(AppDataSource.getRepository(MomoStatementLine), (i) => { const p = payments[i % payments.length]; return { statement: statements[i % statements.length], externalRef: 'MOMO-' + token(8).toUpperCase(), amount: rnd(1, 100) * 1000, operatorStatus: pick(['SUCCESSFUL', 'SUCCESSFUL', 'FAILED']), occurredAt: daysAgo(rnd(0, 200)), matchStatus: pick(['matched', 'matched', 'missing_in_platform', 'missing_at_operator', 'amount_mismatch', 'resolved'] as const), matchedPaymentId: Math.random() > 0.4 ? p.id : null, note: null }; });

  // ═══ 12. Paniers ═════════════════════════════════════════════
  const cartRepo = AppDataSource.getRepository(Cart);
  const cartShort = Math.max(0, TARGET - await count(cartRepo));
  const usersNoCart = cartShort > 0 ? await usersWithout(cartRepo, cartShort) : [];
  const carts = await ensure(AppDataSource.getRepository(Cart), (i) => ({
    user: usersNoCart[i] ?? users[(i + cartShort) % users.length],
    createdAt: daysAgo(rnd(0, 10)), updatedAt: daysAgo(rnd(0, 5)),
  }));
  await ensure(AppDataSource.getRepository(CartItem), (i) => { const v = variants[i % variants.length]; return { cart: carts[i % carts.length], variant: v, quantity: rnd(1, 5), priceAtAdd: rnd(5, 300) * 1000, createdAt: daysAgo(rnd(0, 10)) }; });
  void addresses;

  // ═══ Catalogues B2B ══════════════════════════════════════════
  const catalogs = await ensure(AppDataSource.getRepository(Catalog), (i) => ({
    orgId: pick(allOrgs).id!,
    name: pick(['Catalogue Grossiste', 'Catalogue Garage', 'Catalogue Promo', 'Catalogue Premium', 'Grille Flotte']) + ' ' + (i + 1),
    visibility: pick(['public', 'b2b_only', 'private'] as const),
    markupPct: rnd(0, 25),
    validFrom: daysAgo(rnd(10, 60)), validUntil: daysAhead(rnd(30, 180)),
    isActive: true,
  }));
  await ensure(AppDataSource.getRepository(CatalogProduct), (i) => ({
    catalog: catalogs[i % catalogs.length],
    variant: pick(variants),
    customPrice: Math.random() > 0.5 ? rnd(5, 250) * 1000 : null,
    minQty: rnd(1, 10), maxQty: null, isAvailable: true,
  }));

  // ═══ Rapport final ═══════════════════════════════════════════
  const report: Array<[string, number]> = [];
  const reportEntities = [User, Organization, OrgTier, OrgInvitation, OrgDocument, Category, Brand, Product, ProductVariant, ProductImage, ProductCompatibility, ProductEvent, ProductQA, PriceHistory, Warehouse, StockLevel, StockMovement, StockAudit, StockForecast, Address, Cart, CartItem, Order, OrderLine, OrderApproval, RecurringOrder, Payment, Refund, MomoStatement, MomoStatementLine, Shipment, ShippingZone, SellerLocation, ReturnRequest, Dispute, Commission, Quote, PurchaseOrder, PriceContract, Promotion, Bundle, BundleItem, PickList, Review, Wishlist, LoyaltyPoints, Wallet, WalletTransaction, WalletRecharge, WalletWithdrawal, Notification, Message, ChatSession, SearchHistory, Campaign, CampaignRecipient, ConsentLog, AuditLog, TwoFactorAuth, TaxConfig, Catalog, CatalogProduct].filter(Boolean);
  for (const entity of reportEntities) {
    if (!entity) { console.warn('⚠️ entité undefined dans le rapport'); continue; }
    report.push([AppDataSource.getRepository(entity).metadata.name, await AppDataSource.getRepository(entity).count()]);
  }
  console.table(report.reduce((acc, [name, c]) => { (acc as any)[name] = c; return acc; }, {}));
  const under = report.filter(([, c]) => c < TARGET);
  if (under.length) console.log('⚠️  Tables sous le seuil :', under.map(([n, c]) => `${n} (${c})`).join(', '));
  else console.log('✅ Toutes les tables ont au moins', TARGET, 'lignes.');

  await AppDataSource.destroy();
}

main().catch((e) => { console.error('Seed échoué :', e); process.exit(1); });
