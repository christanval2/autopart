import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Règles métier org_type :
 * - organizations.can_sell : capacité de vendre (dérivée de org_type, modifiable
 *   par un admin — exception « garage activé vendeur »). Backfill : true pour
 *   importer/wholesaler existants.
 * - products.min_order_qty (MOQ, nullable = pas de MOQ ; backfill selon
 *   org_type du vendeur : importer 50/palette, wholesaler 5/carton, autre 1)
 * - products.public_listing (visibilité catalogue public, défaut false)
 * - Tiers canoniques de la grille de prix : gros-export (20 %), gros (10 %),
 *   détail (0 %) — insérés s'ils n'existent pas.
 * - Tier par défaut pour les organisations sans tier, selon org_type
 *   (importer→gros-export, wholesaler→gros, retailer/garage→détail).
 * - org_type : jamais null en base (DEFAULT 'retailer', le plus restrictif).
 */
export class OrgTypeBusinessRules1700000008000 implements MigrationInterface {
  name = 'OrgTypeBusinessRules1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // org_type : ne jamais laisser null (défaut le plus restrictif)
    await queryRunner.query(`ALTER TABLE "organizations" ALTER COLUMN "org_type" SET DEFAULT 'retailer'`);

    // Capacité de vendre, dérivée puis ajustable par un admin
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "can_sell" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "organizations" SET "can_sell" = true WHERE "org_type" IN ('importer','wholesaler')`);

    // MOQ + visibilité catalogue public sur les produits
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "min_order_qty" integer`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "public_listing" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`
      UPDATE "products" p SET "min_order_qty" = CASE o."org_type"
          WHEN 'importer'   THEN 50
          WHEN 'wholesaler' THEN 5
          ELSE 1 END
      FROM "organizations" o WHERE p."org_id" = o."id"`);

    // Tiers canoniques de la grille de prix (idempotent)
    await queryRunner.query(`
      INSERT INTO "org_tiers" ("name","discount_rate","min_order_qty","min_order_value","can_buy_wholesale","can_sell")
      SELECT t.name, t.rate, 1, 0, t.buy_wholesale, t.sell
      FROM (VALUES
        ('gros-export', 20::decimal, true,  true),
        ('gros',        10::decimal, true,  false),
        ('détail',       0::decimal, false, false)
      ) AS t(name, rate, buy_wholesale, sell)
      WHERE NOT EXISTS (SELECT 1 FROM "org_tiers" e WHERE e."name" = t.name)`);

    // Tier par défaut des organisations sans tier, selon org_type
    await queryRunner.query(`
      UPDATE "organizations" o SET "tier_id" = t."id"
      FROM "org_tiers" t
      WHERE o."tier_id" IS NULL
        AND t."name" = CASE o."org_type"
          WHEN 'importer'   THEN 'gros-export'
          WHEN 'wholesaler' THEN 'gros'
          ELSE 'détail' END`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "organizations" SET "tier_id" = NULL WHERE "tier_id" IN (
      SELECT "id" FROM "org_tiers" WHERE "name" IN ('gros-export','gros','détail'))`);
    await queryRunner.query(`DELETE FROM "org_tiers" WHERE "name" IN ('gros-export','gros','détail')`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "public_listing"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "min_order_qty"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "can_sell"`);
  }
}
