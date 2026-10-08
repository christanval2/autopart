import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { User }         from '../entities/User';
import { Organization } from '../entities/Organization';
import { OrgTier }      from '../entities/OrgTier';
import { Category }     from '../entities/Category';
import { Brand }        from '../entities/Brand';
import { Product }      from '../entities/Product';
import { ProductVariant } from '../entities/ProductVariant';
import { ProductCompatibility } from '../entities/ProductCompatibility';
import { Warehouse }    from '../entities/Warehouse';
import { StockLevel }   from '../entities/StockLevel';
import { Promotion }     from '../entities/Promotion';
import { Bundle }         from '../entities/Bundle';
import { BundleItem }     from '../entities/BundleItem';
import { Catalog }        from '../entities/Catalog';
import { CatalogProduct } from '../entities/CatalogProduct';
import { SellerLocation } from '../entities/SellerLocation';
import { Wallet }         from '../entities/Wallet';
import { Address }        from '../entities/Address';


async function seed() {
  await AppDataSource.initialize();
  console.log('🌱 Début du seed...');

  const manager = AppDataSource.manager;

  await manager.query(`TRUNCATE TABLE 
    "order_lines", "payments", "shipments", "orders", "stock_levels",
    "product_images", "product_compatibilities", "product_variants", "products",
    "bundles", "bundle_items", "promotions", "reviews", "wishlists", "wallets",
    "wallet_transactions", "addresses", "notifications", "messages", "loyalty_points",
    "two_factor_auth", "stock_audits", "return_requests", "quotes", "recurring_orders",
    "purchase_orders", "product_qa", "price_history", "price_contracts", "pick_lists",
    "order_approvals", "disputes", "commissions", "catalogs", "catalog_products",
    "chat_sessions", "audit_logs", "seller_locations",
    "organizations", "org_tiers", "users", "categories", "brands", "warehouses"
  CASCADE`);
  console.log('  ✓ Tables nettoyées');

  // ── Tiers B2B (grille de prix canonique) ──────────────────
  // gros-export : prix les plus bas (importateurs) ; gros : grossistes ;
  // détail : prix public. Le tier est la source de vérité des prix
  // (discount_rate appliqué au prix de base).
  const tiers = await manager.save(OrgTier, [
    { name: 'gros-export', discountRate: 20, minOrderQty: 1,  minOrderValue: 0, canBuyWholesale: true,  canSell: true },
    { name: 'gros',        discountRate: 10, minOrderQty: 1,  minOrderValue: 0, canBuyWholesale: true,  canSell: true },
    { name: 'détail',      discountRate: 0,  minOrderQty: 1,  minOrderValue: 0, canBuyWholesale: false, canSell: false },
  ]);
  console.log(`  ✓ ${tiers.length} tiers créés (gros-export, gros, détail)`);

  // ── Organisations ─────────────────────────────────────────
  // Tier par défaut + can_sell dérivés de org_type (règles métier).
  const orgs = await manager.save(Organization, [
    { name: 'AutoImport Cameroun', orgType: 'importer',   countryCode: 'CM', taxId: 'RCCM-YAO-001', isVerified: true, creditLimit: 10000000, tier: tiers[0], canSell: true },
    { name: 'PiecePro Grossiste',  orgType: 'wholesaler', countryCode: 'CM', taxId: 'RCCM-YAO-002', isVerified: true, creditLimit: 5000000,  tier: tiers[1], canSell: true },
    { name: 'GarageMax Douala',    orgType: 'retailer',   countryCode: 'CM', taxId: 'RCCM-DLA-003', isVerified: true, creditLimit: 1000000,  tier: tiers[2], canSell: false },
    { name: 'MécaniPlus Yaoundé',  orgType: 'garage',     countryCode: 'CM', taxId: 'RCCM-YAO-004', isVerified: true, creditLimit: 500000,   tier: tiers[2], canSell: false },
  ]);
  console.log(`  ✓ ${orgs.length} organisations créées`);

  // ── Utilisateurs ──────────────────────────────────────────
  const hashSuperAdmin = await bcrypt.hash('Admin1234!', 12);
  const hashLogistic   = await bcrypt.hash('Logistic1234!', 12);
  const hashCompta     = await bcrypt.hash('Comptable1234!', 12);
  const hashVendeur    = await bcrypt.hash('Vendeur1234!', 12);
  const hashOrgAdmin   = await bcrypt.hash('OrgAdmin1234!', 12);
  const hashClient     = await bcrypt.hash('Client1234!', 12);
  const hashPro        = await bcrypt.hash('ProClient1234!', 12);
  const hashTest       = await bcrypt.hash('Test1234!', 12);

  const users = await manager.save(User, [
    { email: 'admin@autoparts.cm',      passwordHash: hashSuperAdmin, firstName: 'Super',   lastName: 'Admin',    accountType: 'admin',  roles: ['super_admin'],           isVerified: true },
    { email: 'logisticien@autoparts.cm', passwordHash: hashLogistic,   firstName: 'Bernard', lastName: 'Logistique',accountType:'pro',     roles: ['logistics'],             isVerified: true, org: orgs[0] },
    { email: 'vendeur@autoparts.cm',     passwordHash: hashVendeur,    firstName: 'Karim',   lastName: 'Vendeur',   accountType:'pro',     roles: ['seller'],                isVerified: true, org: orgs[0] },
    { email: 'orgadmin@autoparts.cm',    passwordHash: hashOrgAdmin,   firstName: 'Amina',   lastName: 'OrgAdmin',  accountType:'pro',     roles: ['org_admin','seller'],    isVerified: true, org: orgs[1] },
    { email: 'client@autoparts.cm',      passwordHash: hashClient,     firstName: 'Alice',   lastName: 'Cliente',   accountType:'individual', roles: ['buyer'],               isVerified: true },
    { email: 'pro@autoparts.cm',         passwordHash: hashPro,        firstName: 'Jean',    lastName: 'Pro',       accountType:'pro',     roles: ['buyer'],                isVerified: true, org: orgs[1] },
    { email: 'garage@autoparts.cm',      passwordHash: hashPro,        firstName: 'Paul',    lastName: 'Garagiste', accountType:'pro',     roles: ['buyer','org_admin'],    isVerified: true, org: orgs[3] },
    { email: 'importer@autoparts.cm',    passwordHash: hashPro,        firstName: 'Rachid',  lastName: 'Import',    accountType:'pro',     roles: ['buyer','org_admin'],    isVerified: true, org: orgs[0] },
    /* ── Test accounts (used by tests/all.test.ts) ────────────── */
    { email: 'admin@test.cm',           passwordHash: hashTest,       firstName: 'Test',    lastName: 'Admin',     accountType: 'admin',  roles: ['super_admin'],          isVerified: true },
    { email: 'seller@test.cm',          passwordHash: hashTest,       firstName: 'Test',    lastName: 'Seller',    accountType: 'pro',     roles: ['org_admin','seller'],       isVerified: true, org: orgs[0] },
    { email: 'buyer@test.cm',           passwordHash: hashTest,       firstName: 'Test',    lastName: 'Buyer',     accountType: 'individual', roles: ['buyer'],              isVerified: true },
]);
  console.log(`  ✓ ${users.length} utilisateurs créés`);

  // ── Catégories ────────────────────────────────────────────
  const cats = await manager.save(Category, [
    { name: 'Freinage',       slug: 'freinage',       depth: 0 },
    { name: 'Moteur',         slug: 'moteur',         depth: 0 },
    { name: 'Transmission',   slug: 'transmission',   depth: 0 },
    { name: 'Suspension',     slug: 'suspension',     depth: 0 },
    { name: 'Carrosserie',    slug: 'carrosserie',    depth: 0 },
    { name: 'Électricité',    slug: 'electricite',    depth: 0 },
    { name: 'Disques de frein',slug: 'disques-frein', depth: 1 },
    { name: 'Plaquettes',     slug: 'plaquettes',     depth: 1 },
    { name: 'Filtres',        slug: 'filtres',        depth: 1 },
    { name: 'Courroie',       slug: 'courroie',       depth: 1 },
    { name: 'Amortisseurs',   slug: 'amortisseurs',   depth: 1 },
    { name: 'Batterie',       slug: 'batterie',       depth: 1 },
  ]);
  // Lier sous-catégories
  cats[6].parentId  = cats[0].id; // Disques → Freinage
  cats[7].parentId  = cats[0].id; // Plaquettes → Freinage
  cats[8].parentId  = cats[1].id; // Filtres → Moteur
  cats[9].parentId  = cats[1].id; // Courroie → Moteur
  cats[10].parentId = cats[3].id; // Amortisseurs → Suspension
  cats[11].parentId = cats[5].id; // Batterie → Électricité
  await manager.save(Category, cats.slice(6));
  console.log(`  ✓ ${cats.length} catégories créées`);

  // ── Marques ───────────────────────────────────────────────
  const brands = await manager.save(Brand, [
    { name: 'Bosch',        countryOfOrigin: 'DE', isOem: false },
    { name: 'TRW',          countryOfOrigin: 'US', isOem: false },
    { name: 'Brembo',       countryOfOrigin: 'IT', isOem: false },
    { name: 'NGK',          countryOfOrigin: 'JP', isOem: false },
    { name: 'Delphi',       countryOfOrigin: 'GB', isOem: false },
    { name: 'Toyota OEM',   countryOfOrigin: 'JP', isOem: true  },
    { name: 'Kia OEM',      countryOfOrigin: 'KR', isOem: true  },
    { name: 'Sachs',        countryOfOrigin: 'DE', isOem: false },
    { name: 'Exide',        countryOfOrigin: 'DE', isOem: false },
    { name: 'Mann Filter',  countryOfOrigin: 'DE', isOem: false },
  ]);
  console.log(`  ✓ ${brands.length} marques créées`);

  // ── Produits ──────────────────────────────────────────────
  // Attribués à un vendeur : importer (MOQ 50 = palette) / wholesaler
  // (MOQ 5 = carton). Seuls les produits marqués public_listing des
  // wholesalers/garages apparaissent sur le catalogue public.
  const products = await manager.save(Product, [
    { sku: 'DSQ-TOY-001', oemReference: '43512-60130', name: 'Disque de frein avant Toyota Hilux',    category: cats[6],  brand: brands[2], basePrice: 45000,  currency: 'XAF', condition: 'new', weightKg: 2.8, org: orgs[0], minOrderQty: 50 },
    { sku: 'PLQ-BOC-001', oemReference: '04465-60080', name: 'Plaquettes frein avant Toyota Land Cruiser', category: cats[7], brand: brands[0], basePrice: 28000, currency: 'XAF', condition: 'new', weightKg: 0.8, org: orgs[0], minOrderQty: 50 },
    { sku: 'FLT-MAN-001', oemReference: 'W 940/68',    name: 'Filtre à huile Mann Filter universel',  category: cats[8],  brand: brands[9], basePrice: 8500,   currency: 'XAF', condition: 'new', weightKg: 0.3, org: orgs[0], minOrderQty: 50 },
    { sku: 'COR-BSH-001', oemReference: '1 987 947 980', name: 'Courroie de distribution Bosch',       category: cats[9],  brand: brands[0], basePrice: 35000,  currency: 'XAF', condition: 'new', weightKg: 0.5, org: orgs[0], minOrderQty: 50 },
    { sku: 'AMO-SAC-001', oemReference: '312 574',      name: 'Amortisseur avant Sachs',              category: cats[10], brand: brands[7], basePrice: 65000,  currency: 'XAF', condition: 'new', weightKg: 4.2, org: orgs[0], minOrderQty: 50 },
    { sku: 'BAT-EXD-001', oemReference: 'EA770',        name: 'Batterie Exide 77Ah 760A',             category: cats[11], brand: brands[8], basePrice: 85000,  currency: 'XAF', condition: 'new', weightKg: 18,  org: orgs[1], minOrderQty: 5,  publicListing: true },
    { sku: 'DSQ-KIA-001', oemReference: '58411-1G300',  name: 'Disque de frein Kia Sportage arrière', category: cats[6],  brand: brands[6], basePrice: 38000,  currency: 'XAF', condition: 'new', weightKg: 2.2, org: orgs[1], minOrderQty: 5 },
    { sku: 'BOU-NGK-001', oemReference: 'BKR6E',        name: 'Bougie NGK Standard',                  category: cats[1],  brand: brands[3], basePrice: 4500,   currency: 'XAF', condition: 'new', weightKg: 0.1, org: orgs[1], minOrderQty: 5,  publicListing: true },
    { sku: 'FLT-BSH-AIR', oemReference: 'F 026 400 368', name: 'Filtre à air Bosch',                  category: cats[8],  brand: brands[0], basePrice: 12000,  currency: 'XAF', condition: 'new', weightKg: 0.4, org: orgs[1], minOrderQty: 5,  publicListing: true },
    { sku: 'PLQ-TRW-001', oemReference: 'GDB1574',      name: 'Plaquettes frein TRW arrière',         category: cats[7],  brand: brands[1], basePrice: 22000,  currency: 'XAF', condition: 'new', weightKg: 0.6, org: orgs[1], minOrderQty: 5 },
  ]);
  console.log(`  ✓ ${products.length} produits créés`);

  // ── Variantes ─────────────────────────────────────────────
  const variants = await manager.save(ProductVariant, [
    { product: products[0], variantSku: 'DSQ-TOY-001-L', attributes: { position: 'gauche', diametre: '296mm' }, costPrice: 32000, reorderPoint: 3 },
    { product: products[0], variantSku: 'DSQ-TOY-001-R', attributes: { position: 'droite', diametre: '296mm' }, costPrice: 32000, reorderPoint: 3 },
    { product: products[1], variantSku: 'PLQ-BOC-001-AV', attributes: { position: 'avant', epaisseur: '18mm' },  costPrice: 19000, reorderPoint: 5 },
    { product: products[2], variantSku: 'FLT-MAN-001-STD', attributes: { type: 'standard' }, costPrice: 5500, reorderPoint: 10 },
    { product: products[3], variantSku: 'COR-BSH-001-STD', attributes: { longueur: '148cm' }, costPrice: 24000, reorderPoint: 4 },
    { product: products[4], variantSku: 'AMO-SAC-001-L', attributes: { position: 'gauche' }, costPrice: 45000, reorderPoint: 2 },
    { product: products[4], variantSku: 'AMO-SAC-001-R', attributes: { position: 'droite' }, costPrice: 45000, reorderPoint: 2 },
    { product: products[5], variantSku: 'BAT-EXD-001-77', attributes: { capacite: '77Ah', amperage: '760A' }, costPrice: 58000, reorderPoint: 2 },
    { product: products[6], variantSku: 'DSQ-KIA-001-STD', attributes: { position: 'arrière' }, costPrice: 26000, reorderPoint: 3 },
    { product: products[7], variantSku: 'BOU-NGK-001-STD', attributes: { ecartement: '0.8mm' }, costPrice: 2800, reorderPoint: 20 },
  ]);
  console.log(`  ✓ ${variants.length} variantes créées`);

  // ── Compatibilités ────────────────────────────────────────
  await manager.save(ProductCompatibility, [
    { product: products[0], make: 'Toyota', model: 'Hilux',       yearFrom: 2015, yearTo: 2023, engineCode: '1KD-FTV' },
    { product: products[0], make: 'Toyota', model: 'Hilux',       yearFrom: 2023,              engineCode: '2GD-FTV' },
    { product: products[1], make: 'Toyota', model: 'Land Cruiser', yearFrom: 2010, yearTo: 2022 },
    { product: products[1], make: 'Toyota', model: 'Prado',        yearFrom: 2010, yearTo: 2022 },
    { product: products[3], make: 'Toyota', model: 'Corolla',      yearFrom: 2009, yearTo: 2019, engineCode: '1ZR-FE' },
    { product: products[3], make: 'Toyota', model: 'RAV4',         yearFrom: 2006, yearTo: 2013 },
    { product: products[4], make: 'Toyota', model: 'Hilux',        yearFrom: 2012, yearTo: 2020 },
    { product: products[6], make: 'Kia',    model: 'Sportage',     yearFrom: 2016, yearTo: 2021, engineCode: 'G4FJ' },
    { product: products[6], make: 'Kia',    model: 'Sportage',     yearFrom: 2021 },
    { product: products[8], make: 'Toyota', model: 'Camry',        yearFrom: 2012, yearTo: 2020 },
    { product: products[8], make: 'Nissan', model: 'Altima',       yearFrom: 2013, yearTo: 2022 },
  ]);
  console.log(`  ✓ Compatibilités créées`);

  // ── Entrepôts ─────────────────────────────────────────────
  const warehouses = await manager.save(Warehouse, [
    { org: orgs[0], name: 'Dépôt Principal Yaoundé',   countryCode: 'CM', city: 'Yaoundé',  address: 'Zone Industrielle Bassa, Yaoundé' },
    { org: orgs[0], name: 'Dépôt Douala',              countryCode: 'CM', city: 'Douala',   address: 'Port Autonome, Douala' },
    { org: orgs[1], name: 'Entrepôt PiecePro Central', countryCode: 'CM', city: 'Yaoundé',  address: 'Quartier Nlongkak, Yaoundé' },
  ]);
  console.log(`  ✓ ${warehouses.length} entrepôts créés`);

  // ── Stock ─────────────────────────────────────────────────
  // Quantité déterministe (100) > MOQ importer (50) : reproductible
  // pour les tests d'intégration (commandes au-delà du MOQ).
  const stockEntries = [];
  for (const variant of variants) {
    stockEntries.push({ warehouse: warehouses[0], variant, qtyOnHand: 100, qtyReserved: 0 });
    stockEntries.push({ warehouse: warehouses[1], variant, qtyOnHand: 100, qtyReserved: 0 });
  }
  await manager.save(StockLevel, stockEntries);
  console.log(`  ✓ ${stockEntries.length} entrées de stock créées`);


  // ── Promotions ────────────────────────────────────────────────
  const now   = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  await manager.save(Promotion, [
    {
      code: 'BIENVENUE10', name: 'Bienvenue -10%', type: 'percentage', scope: 'all',
      discountValue: 10, minOrderAmount: 20000, maxUses: 100, maxUsesPerUser: 1,
      validFrom: now, validUntil: month, isActive: true,
    },
    {
      code: 'FRAIS0', name: 'Livraison gratuite', type: 'free_shipping', scope: 'all',
      discountValue: 0, minOrderAmount: 50000, maxUsesPerUser: 3,
      validFrom: now, validUntil: month, isActive: true,
    },
    {
      code: 'PROMO5000', name: 'Remise fixe 5000 XAF', type: 'fixed', scope: 'all',
      discountValue: 5000, minOrderAmount: 30000, maxUsesPerUser: 2,
      validFrom: now, validUntil: month, isActive: true,
    },
  ]);
  console.log('  ✓ 3 promotions créées');

  // ── Bundle / Kit ───────────────────────────────────────────────
  const bundle = manager.create(Bundle, {
    name: 'Kit Freinage Complet Toyota Hilux', 
    description: 'Disques + Plaquettes avant pour Toyota Hilux 2015-2023',
    bundlePrice: 65000, currency: 'XAF', isActive: true,
  });
  await manager.save(Bundle, bundle);
  await manager.save(BundleItem, [
    { bundle, variant: variants[0], quantity: 2 },
    { bundle, variant: variants[2], quantity: 1 },
  ]);
  console.log('  ✓ 1 bundle créé');

  // ── Catalogues ────────────────────────────────────────────────
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const catalog1 = manager.create(Catalog, {
    org: orgs[0], name: 'Tarifs Préférentiels AutoImport', visibility: 'b2b_only',
    markupPct: 12, validFrom: now, validUntil: nextMonth, isActive: true,
  });
  const catalog2 = manager.create(Catalog, {
    org: orgs[1], name: 'Grossiste PiecePro - Tarifs Publics', visibility: 'public',
    markupPct: 8, validFrom: now, validUntil: nextMonth, isActive: true,
  });
  const catalog3 = manager.create(Catalog, {
    org: orgs[0], name: 'Promo Fin d\'Année Freinage', visibility: 'public',
    markupPct: 5, validFrom: now, validUntil: nextMonth, isActive: true,
  });
  await manager.save(Catalog, [catalog1, catalog2, catalog3]);

  await manager.save(CatalogProduct, [
    { catalog: catalog1, variant: variants[0], customPrice: 42000, minQty: 5, maxQty: 100, isAvailable: true },
    { catalog: catalog1, variant: variants[2], customPrice: 26000, minQty: 10, maxQty: 200, isAvailable: true },
    { catalog: catalog2, variant: variants[1], customPrice: 27000, minQty: 1, maxQty: 50, isAvailable: true },
    { catalog: catalog2, variant: variants[3], customPrice: 33000, minQty: 1, maxQty: 30, isAvailable: true },
    { catalog: catalog3, variant: variants[0], customPrice: 40000, minQty: 1, maxQty: 500, isAvailable: true },
    { catalog: catalog3, variant: variants[2], customPrice: 25000, minQty: 1, maxQty: 500, isAvailable: true },
  ]);
  console.log('  ✓ 3 catalogues avec produits créés');

  // ── Wallets utilisateurs ───────────────────────────────────────
  for (const user of users) {
    await manager.save(Wallet, { user, balance: 0, currency: 'XAF', isActive: true });
  }
  console.log('  ✓ Wallets créés pour chaque utilisateur');

  // ── Adresses utilisateurs (pour tests) ──────────────────────────
  const buyerUser = users.find(u => u.email === 'buyer@test.cm');
  if (buyerUser) {
    await manager.save(Address, [
      { user: buyerUser, street: '123 Rue de la Paix', city: 'Yaoundé', countryCode: 'CM', isDefault: true },
      { user: buyerUser, street: '456 Avenue du 20ème', city: 'Douala', countryCode: 'CM', isDefault: false },
    ]);
  }
  const garageUser = users.find(u => u.email === 'garage@autoparts.cm');
  if (garageUser) {
    await manager.save(Address, [
      { user: garageUser, street: '789 Boulevard de l\'Unité', city: 'Yaoundé', countryCode: 'CM', isDefault: true },
      { user: garageUser, street: '12 Rue du Garage', city: 'Yaoundé', countryCode: 'CM', isDefault: false },
    ]);
  }
  const proUser = users.find(u => u.email === 'pro@autoparts.cm');
  if (proUser) {
    await manager.save(Address, [
      { user: proUser, street: '21 Avenue des Grossistes', city: 'Yaoundé', countryCode: 'CM', isDefault: true },
      { user: proUser, street: '22 Avenue des Grossistes', city: 'Douala', countryCode: 'CM', isDefault: false },
    ]);
  }
  const importerUser = users.find(u => u.email === 'importer@autoparts.cm');
  if (importerUser) {
    await manager.save(Address, [
      { user: importerUser, street: '5 Zone Industrielle', city: 'Yaoundé', countryCode: 'CM', isDefault: true },
      { user: importerUser, street: '6 Zone Industrielle', city: 'Douala', countryCode: 'CM', isDefault: false },
    ]);
  }
  console.log('  ✓ Adresses créées pour les comptes de test');

  // ── Localisation vendeurs ──────────────────────────────────────
  await manager.save(SellerLocation, [
    { org: orgs[0], latitude: 3.8667, longitude: 11.5167, city: 'Yaoundé', address: 'Zone Industrielle Bassa, Yaoundé', isVisible: true },
    { org: orgs[1], latitude: 4.0511, longitude: 9.7679, city: 'Douala', address: 'Akwa, Douala', isVisible: true },
  ]);
  console.log('  ✓ 2 localisations vendeurs créées');

  await AppDataSource.destroy();
  console.log('\n✅ Seed terminé avec succès !');
  console.log('   Comptes de test :');
   console.log('   - admin@autoparts.cm       → super_admin (Admin1234!)');
   console.log('   - logisticien@autoparts.cm → logistics (Logistic1234!)');
   console.log('   - vendeur@autoparts.cm     → seller (Vendeur1234!)');
   console.log('   - orgadmin@autoparts.cm    → org_admin + seller (OrgAdmin1234!)');
   console.log('   - client@autoparts.cm      → buyer (Client1234!)');
   console.log('   - pro@autoparts.cm         → buyer (ProClient1234!)');
   console.log('   Comptes de test :');
   console.log('   - admin@test.cm            → super_admin (Test1234!)');
   console.log('   - seller@test.cm           → seller (Test1234!)');
   console.log('   - buyer@test.cm            → buyer (Test1234!)');
}

seed().catch(err => { console.error('❌ Seed échoué:', err); process.exit(1); });
