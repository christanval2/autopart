// ── Seed catalogue public depuis src/assetproduits ─────────────
// 1 produit par image : nom identifié visuellement, catégorie,
// marque, prix XAF, état. Idempotent (SKU = clé).
//
//   npx ts-node --transpile-only -r tsconfig-paths/register scripts/seed-assetproduits.ts
//
import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Product }       from '../src/entities/Product';
import { ProductVariant }from '../src/entities/ProductVariant';
import { ProductImage }  from '../src/entities/ProductImage';
import { Category }      from '../src/entities/Category';
import { Brand }         from '../src/entities/Brand';
import { Organization }  from '../src/entities/Organization';
import { Warehouse }     from '../src/entities/Warehouse';
import { StockLevel }    from '../src/entities/StockLevel';

type Cond = 'new' | 'genuine_used' | 'reconditioned';
interface Entry {
  file: string; name: string; cat: string; brand: string;
  price: number; cond?: Cond; oem?: string;
}

// ── Les 87 produits (ordre = ap-001 … ap-087) ──────────────────
const DATA: Entry[] = [
  // Éclairage — phares avant
  { file: 'ap-001.jpeg', name: 'Phare avant droit — Toyota Yaris II (chrome)',            cat: 'Éclairage', brand: 'Toyota',    price: 65000 },
  { file: 'ap-002.jpeg', name: 'Phare avant LED noir — Mercedes Classe A',                cat: 'Éclairage', brand: 'Générique', price: 145000 },
  { file: 'ap-003.jpeg', name: 'Phare avant halogène — berline (monté)',                  cat: 'Éclairage', brand: 'Générique', price: 55000 },
  { file: 'ap-004.jpeg', name: 'Phare avant gauche — Peugeot 206 (chrome)',               cat: 'Éclairage', brand: 'Générique', price: 48000 },
  { file: 'ap-005.jpeg', name: 'Phare avant — Toyota Yaris (chrome)',                     cat: 'Éclairage', brand: 'Toyota',    price: 52000 },
  { file: 'ap-006.jpeg', name: 'Phare avant — Toyota Aygo',                               cat: 'Éclairage', brand: 'Toyota',    price: 45000 },
  { file: 'ap-007.jpeg', name: 'Phare avant LED noir — Toyota Vitz',                      cat: 'Éclairage', brand: 'Toyota',    price: 98000 },
  { file: 'ap-008.jpeg', name: 'Phare avant gauche — Toyota Yaris',                       cat: 'Éclairage', brand: 'Toyota',    price: 50000 },
  { file: 'ap-009.jpeg', name: 'Phare avant DRL chrome — Toyota Auris / Corolla',         cat: 'Éclairage', brand: 'Toyota',    price: 88000 },
  // Éclairage — feux arrière
  { file: 'ap-010.jpeg', name: 'Feu arrière droit — Toyota Aygo (rouge/ambre)',           cat: 'Éclairage', brand: 'Toyota',    price: 28000 },
  { file: 'ap-011.jpeg', name: 'Phare avant chrome — Peugeot 206',                        cat: 'Éclairage', brand: 'Générique', price: 47000 },
  { file: 'ap-012.jpeg', name: 'Feux arrière LED noirs (paire) — style sport',            cat: 'Éclairage', brand: 'Générique', price: 78000 },
  { file: 'ap-013.jpeg', name: 'Phare avant double optique noir — Honda Fit / Jazz',      cat: 'Éclairage', brand: 'Générique', price: 68000 },
  { file: 'ap-014.jpeg', name: 'Feu arrière — Toyota (petit modèle)',                     cat: 'Éclairage', brand: 'Toyota',    price: 24000 },
  { file: 'ap-015.jpeg', name: 'Feu arrière LED barre — Toyota Yaris',                    cat: 'Éclairage', brand: 'Toyota',    price: 42000 },
  { file: 'ap-016.jpeg', name: 'Feu arrière droit — citadine',                            cat: 'Éclairage', brand: 'Générique', price: 22000 },
  { file: 'ap-017.jpeg', name: 'Feu arrière LED noir — Toyota Vitz',                      cat: 'Éclairage', brand: 'Toyota',    price: 45000 },
  { file: 'ap-018.jpeg', name: 'Feu arrière monté — Toyota Aygo',                         cat: 'Éclairage', brand: 'Toyota',    price: 18000, cond: 'genuine_used' },
  { file: 'ap-019.jpeg', name: 'Feu arrière rouge/blanc/chrome — minibus',                cat: 'Éclairage', brand: 'Générique', price: 38000 },
  { file: 'ap-020.jpeg', name: 'Feu arrière — Toyota Land Cruiser Prado',                 cat: 'Éclairage', brand: 'Toyota',    price: 56000 },
  { file: 'ap-021.jpeg', name: 'Feu arrière droit — Toyota RAV4',                         cat: 'Éclairage', brand: 'Toyota',    price: 44000 },
  // Carrosserie — pare-chocs
  { file: 'ap-022.jpeg', name: 'Pare-chocs avant peint — Toyota Corolla',                 cat: 'Carrosserie', brand: 'Toyota',    price: 85000 },
  { file: 'ap-023.jpeg', name: 'Pare-chocs avant — Mazda (bleu)',                         cat: 'Carrosserie', brand: 'Mazda',     price: 75000 },
  { file: 'ap-024.jpeg', name: 'Pare-chocs arrière — berline blanche',                    cat: 'Carrosserie', brand: 'Générique', price: 62000 },
  { file: 'ap-025.jpeg', name: 'Lame de pare-chocs avant — Toyota Yaris',                 cat: 'Carrosserie', brand: 'Toyota',    price: 35000 },
  { file: 'ap-026.jpeg', name: 'Pare-chocs avant à peindre — Toyota',                     cat: 'Carrosserie', brand: 'Toyota',    price: 55000 },
  { file: 'ap-027.jpeg', name: 'Pare-chocs arrière — Toyota Aygo (rouge)',                cat: 'Carrosserie', brand: 'Toyota',    price: 58000 },
  { file: 'ap-028.jpeg', name: 'Pare-chocs avant à peindre — berline (apprêt)',           cat: 'Carrosserie', brand: 'Générique', price: 48000 },
  { file: 'ap-029.jpeg', name: 'Pare-chocs arrière + marches latérales — SUV',            cat: 'Carrosserie', brand: 'Générique', price: 95000 },
  { file: 'ap-030.jpeg', name: 'Pare-chocs avant noir — berline',                         cat: 'Carrosserie', brand: 'Générique', price: 52000 },
  { file: 'ap-031.jpeg', name: 'Pare-chocs avant — pick-up (gris)',                       cat: 'Carrosserie', brand: 'Toyota',    price: 78000 },
  { file: 'ap-032.jpeg', name: 'Pare-chocs avant — Toyota RAV4 (anthracite)',             cat: 'Carrosserie', brand: 'Toyota',    price: 88000 },
  { file: 'ap-033.jpeg', name: 'Face avant complète — Toyota RAV4',                       cat: 'Carrosserie', brand: 'Toyota',    price: 320000 },
  // Carrosserie — capots
  { file: 'ap-034.jpeg', name: 'Capot noir — Toyota',                                     cat: 'Carrosserie', brand: 'Toyota',    price: 72000 },
  { file: 'ap-035.jpeg', name: 'Capot blanc — Toyota (neuf)',                             cat: 'Carrosserie', brand: 'Toyota',    price: 78000 },
  { file: 'ap-036.jpeg', name: 'Capot rouge — Toyota',                                    cat: 'Carrosserie', brand: 'Toyota',    price: 68000 },
  { file: 'ap-037.jpeg', name: 'Capot gris anthracite — Toyota Corolla',                  cat: 'Carrosserie', brand: 'Toyota',    price: 75000 },
  { file: 'ap-038.jpeg', name: 'Capot gris — berline',                                    cat: 'Carrosserie', brand: 'Générique', price: 65000 },
  { file: 'ap-039.jpeg', name: 'Capot argent — berline',                                  cat: 'Carrosserie', brand: 'Générique', price: 68000 },
  { file: 'ap-040.jpeg', name: 'Capot argent — Toyota Corolla',                           cat: 'Carrosserie', brand: 'Toyota',    price: 70000 },
  // Carrosserie — hayons
  { file: 'ap-041.jpeg', name: 'Hayon arrière — Toyota Corolla D-4D (marron)',            cat: 'Carrosserie', brand: 'Toyota', price: 165000, cond: 'genuine_used' },
  { file: 'ap-042.jpeg', name: 'Hayon arrière — Toyota Corolla Verso (gris)',             cat: 'Carrosserie', brand: 'Toyota', price: 175000, cond: 'genuine_used' },
  { file: 'ap-043.jpeg', name: 'Hayon + roue de secours — Toyota RAV4',                   cat: 'Carrosserie', brand: 'Toyota', price: 195000, cond: 'genuine_used' },
  { file: 'ap-044.jpeg', name: 'Hayon arrière — Toyota Yaris (bleu)',                     cat: 'Carrosserie', brand: 'Toyota', price: 155000, cond: 'genuine_used' },
  { file: 'ap-045.jpeg', name: 'Hayon de coffre — Toyota Corolla hybride (rouge)',        cat: 'Carrosserie', brand: 'Toyota', price: 185000 },
  { file: 'ap-046.jpeg', name: 'Hayon arrière — Toyota Corolla Verso (anthracite)',       cat: 'Carrosserie', brand: 'Toyota', price: 160000, cond: 'genuine_used' },
  { file: 'ap-047.jpeg', name: 'Hayon arrière blanc — Toyota RAV4',                       cat: 'Carrosserie', brand: 'Toyota', price: 210000 },
  { file: 'ap-048.jpeg', name: 'Hayon arrière argent — Toyota Yaris',                     cat: 'Carrosserie', brand: 'Toyota', price: 150000, cond: 'genuine_used' },
  // Rétroviseurs
  { file: 'ap-049.jpeg', name: 'Rétroviseur extérieur électrique — berline (argent)',     cat: 'Rétroviseurs', brand: 'Générique', price: 28000 },
  { file: 'ap-050.jpeg', name: 'Rétroviseur avec clignotant — noir',                      cat: 'Rétroviseurs', brand: 'Générique', price: 32000 },
  { file: 'ap-051.jpeg', name: 'Rétroviseur manuel — Toyota (noir)',                      cat: 'Rétroviseurs', brand: 'Toyota',    price: 18000 },
  { file: 'ap-052.jpeg', name: 'Rétroviseur électrique gris — Toyota',                    cat: 'Rétroviseurs', brand: 'Toyota',    price: 26000 },
  { file: 'ap-053.jpeg', name: 'Rétroviseur chromé avec clignotant',                      cat: 'Rétroviseurs', brand: 'Générique', price: 34000 },
  { file: 'ap-054.jpeg', name: 'Rétroviseur neuf — Toyota (noir)',                        cat: 'Rétroviseurs', brand: 'Toyota',    price: 29500 },
  { file: 'ap-055.jpeg', name: 'Rétroviseur — Toyota Yaris (gris titane)',                cat: 'Rétroviseurs', brand: 'Toyota',    price: 27000, cond: 'genuine_used' },
  { file: 'ap-056.jpeg', name: 'Rétroviseur blanc/noir — SUV',                            cat: 'Rétroviseurs', brand: 'Générique', price: 24000 },
  { file: 'ap-057.jpeg', name: 'Rétroviseur noir — Toyota (avec cache)',                  cat: 'Rétroviseurs', brand: 'Toyota',    price: 25500 },
  // Mécanique / transmission
  { file: 'ap-058.jpeg', name: 'Boîte de vitesses manuelle',                              cat: 'Transmission', brand: 'Générique', price: 285000, cond: 'genuine_used' },
  { file: 'ap-059.jpeg', name: 'Transmission complète — transaxle',                       cat: 'Transmission', brand: 'Générique', price: 240000, cond: 'genuine_used' },
  { file: 'ap-060.jpeg', name: 'Crémaillère de direction assistée',                       cat: 'Direction & train', brand: 'Générique', price: 165000 },
  { file: 'ap-061.jpeg', name: 'Pompe à carburant mécanique — TOBA',                      cat: 'Moteur',       brand: 'TOBA',      price: 32000 },
  { file: 'ap-062.jpeg', name: "Pignon d'engrenage — boîte de vitesses",                  cat: 'Transmission', brand: 'Générique', price: 45000 },
  { file: 'ap-063.jpeg', name: 'Pompe à injection — diesel',                              cat: 'Moteur',       brand: 'Générique', price: 195000, cond: 'genuine_used' },
  { file: 'ap-064.jpeg', name: 'Jeu de roulements (3 pièces)',                            cat: 'Direction & train', brand: 'Générique', price: 18500 },
  { file: 'ap-065.jpeg', name: 'Vilebrequin — Toyota Corolla 1997-2002',                  cat: 'Moteur',       brand: 'Toyota',    price: 285000 },
  { file: 'ap-066.jpeg', name: 'Jeu de disques de frein percés — avant',                  cat: 'Disques de frein', brand: 'Générique', price: 38000 },
  { file: 'ap-067.jpeg', name: 'Amortisseurs sport coilover (paire)',                     cat: 'Amortisseurs', brand: 'Générique', price: 165000 },
  { file: 'ap-068.jpeg', name: 'Boîte de vitesses complète — reconditionnée',             cat: 'Transmission', brand: 'Générique', price: 425000, cond: 'reconditioned' },
  { file: 'ap-069.jpeg', name: 'Carter de boîte automatique',                             cat: 'Transmission', brand: 'Générique', price: 265000, cond: 'genuine_used' },
  { file: 'ap-070.jpeg', name: 'Bras de suspension triangulaire',                         cat: 'Direction & train', brand: 'Générique', price: 58500 },
  { file: 'ap-071.jpeg', name: 'Moteur complet — bloc moderne',                           cat: 'Moteur',       brand: 'Générique', price: 1850000 },
  { file: 'ap-072.jpeg', name: 'Jeu de mâchoires de frein arrière',                       cat: 'Freinage',     brand: 'Générique', price: 19500 },
  { file: 'ap-073.jpeg', name: 'Kit pistons boîte auto U250/U251 — Toyota',               cat: 'Transmission', brand: 'Toyota',    price: 64000 },
  { file: 'ap-074.jpeg', name: 'Rotule de direction',                                     cat: 'Direction & train', brand: 'Générique', price: 15500 },
  // Batteries
  { file: 'ap-075.jpeg', name: 'Batterie Yuasa YBX3055 — 12V 36Ah 330A',                  cat: 'Batterie', brand: 'Yuasa',    price: 48000 },
  { file: 'ap-076.jpeg', name: 'Batterie Power Plus — 12V 75Ah 750A',                     cat: 'Batterie', brand: 'Générique', price: 72000 },
  { file: 'ap-077.jpeg', name: 'Batterie 12V 70Ah 640A',                                  cat: 'Batterie', brand: 'Générique', price: 65000 },
  { file: 'ap-078.jpeg', name: 'Batterie Power Hexagone — 12V 40Ah 340A',                 cat: 'Batterie', brand: 'Générique', price: 43500 },
  // Calandres
  { file: 'ap-079.jpeg', name: 'Calandre noire TRD — Toyota Hilux',                       cat: 'Carrosserie', brand: 'Toyota', price: 45000 },
  { file: 'ap-080.jpeg', name: 'Calandre chromée — Toyota Camry',                         cat: 'Carrosserie', brand: 'Toyota', price: 38500 },
  // Lubrifiants
  { file: 'ap-081.jpeg', name: 'Huile moteur Venol 10W-40 semi-synthèse — 1L',            cat: 'Lubrifiants', brand: 'Venol', price: 6500 },
  // PNG nommés
  { file: 'parechoc.png',                 name: 'Pare-chocs avant universel — blanc (neuf)',        cat: 'Carrosserie', brand: 'Générique', price: 62000 },
  { file: 'parechoc-155.png',             name: 'Pare-chocs avant — Peugeot (gris)',                cat: 'Carrosserie', brand: 'Générique', price: 42000, cond: 'genuine_used' },
  { file: 'parechoc-rav4.png',            name: 'Pare-chocs avant — Toyota RAV4 2019+ (noir)',      cat: 'Carrosserie', brand: 'Toyota',    price: 125000 },
  { file: 'parechoc-yaris2002.png',       name: 'Pare-chocs avant — Toyota Yaris 2002 (gris)',      cat: 'Carrosserie', brand: 'Toyota',    price: 68000 },
  { file: 'parechoc-yaris-vitz2005.png',  name: 'Pare-chocs avant — Toyota Yaris 2005 (argent)',    cat: 'Carrosserie', brand: 'Toyota',    price: 72000 },
  { file: 'hayon-rav4.png',               name: 'Hayon arrière avec roue — Toyota RAV4 (argent)',   cat: 'Carrosserie', brand: 'Toyota',    price: 205000, cond: 'genuine_used' },
];

async function main() {
  await AppDataSource.initialize();

  // 1. Org vendeur (AutoImport Cameroun) + ses entrepôts
  const org = await AppDataSource.getRepository(Organization).findOneByOrFail({ name: 'PiecePro Grossiste' });
  const warehouses = await AppDataSource.getRepository(Warehouse).find({ where: { org: { id: org.id } } });
  const mainWh = warehouses.find((w) => /douala/i.test(w.city)) ?? warehouses[0];

  // 2. Catégories (parent racine = null) — créer si absentes
  const catRepo = AppDataSource.getRepository(Category);
  const neededCats = [...new Set(DATA.map((d) => d.cat))];
  const cats = new Map<string, Category>();
  for (const name of neededCats) {
    let cat = await catRepo.findOneBy({ name });
    if (!cat) {
      cat = await catRepo.save(catRepo.create({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), depth: 0, isActive: true } as any));
      console.log('  + catégorie', name);
    }
    cats.set(name, cat);
  }

  // 3. Marques — créer si absentes
  const brandRepo = AppDataSource.getRepository(Brand);
  const neededBrands = [...new Set(DATA.map((d) => d.brand))];
  const brands = new Map<string, Brand>();
  for (const name of neededBrands) {
    let brand = await brandRepo.findOneBy({ name });
    if (!brand) {
      brand = await brandRepo.save(brandRepo.create({ name, isOem: name === 'Toyota', isActive: true } as any));
      console.log('  + marque', name);
    }
    brands.set(name, brand);
  }

  // 4. Produits + variante + image + stock
  const prodRepo = AppDataSource.getRepository(Product);
  let created = 0, skipped = 0;
  for (let i = 0; i < DATA.length; i++) {
    const e = DATA[i];
    const idx = i + 1;
    const sku = `AP-${String(idx).padStart(3, '0')}`;
    if (await prodRepo.findOneBy({ sku })) { skipped++; continue; }

    const product = await prodRepo.save(prodRepo.create({
      sku,
      name: e.name,
      description: `${e.name} — pièce contrôlée et garantie par AutoParts Cameroun. Livraison 24-48 h à Douala et Yaoundé.`,
      categoryId: cats.get(e.cat)!.id,
      brandId: brands.get(e.brand)!.id,
      basePrice: e.price,
      currency: 'XAF',
      condition: (e.cond ?? 'new') as any,
      weightKg: 3,
      isActive: true,
      publicListing: true,          // catalogue PUBLIC
      minOrderQty: 1,
      orgId: org.id,
    }));

    const variant = await AppDataSource.getRepository(ProductVariant).save(
      AppDataSource.getRepository(ProductVariant).create({
        variantSku: `${sku}-STD`,
        attributes: { version: 'standard' },
        costPrice: Math.round(e.price * 0.6),
        reorderPoint: 3,
        isActive: true,
        product,
      }),
    );

    await AppDataSource.getRepository(ProductImage).save(
      AppDataSource.getRepository(ProductImage).create({
        product,
        url: `/uploads/products/${e.file}`,
        sizes: { thumb: `/uploads/products/${e.file}`, medium: `/uploads/products/${e.file}`, large: `/uploads/products/${e.file}` },
        altText: e.name,
        isPrimary: true,
        sortOrder: 0,
      }),
    );

    if (mainWh) {
      await AppDataSource.getRepository(StockLevel).save(
        AppDataSource.getRepository(StockLevel).create({
          warehouse: mainWh,
          variant,
          qtyOnHand: 6 + (idx % 25),
          qtyReserved: 0,
        }),
      );
    }
    created++;
  }

  console.log(`\n✅ Catalogue assetproduits : ${created} produit(s) créé(s), ${skipped} déjà présent(s).`);
  await AppDataSource.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
