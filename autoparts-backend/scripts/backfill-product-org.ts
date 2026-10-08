// Backfill R1 — attache org_id aux produits via leurs niveaux de stock
// npx ts-node --transpile-only -r tsconfig-paths/register scripts/backfill-product-org.ts
import 'reflect-metadata';
import { AppDataSource } from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  const r = await AppDataSource.query(`
    UPDATE products p SET org_id = sub.org_id
    FROM (
      SELECT v."productId", MIN(w.org_id::text)::uuid AS org_id
      FROM stock_levels sl
      JOIN product_variants v ON v.id = sl."variantId"
      JOIN warehouses w ON w.id = sl."warehouseId"
      GROUP BY v."productId"
    ) sub
    WHERE p.id = sub."productId" AND p.org_id IS NULL
  `);
  console.log('Produits réassignés :', r[1] ?? 'ok');
  await AppDataSource.destroy();
}
main().catch(e => { console.error(e); process.exit(1); });
