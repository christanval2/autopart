import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R1/R4 — Rôles & référentiels :
 * - products.org_id (propriété vendeur, nullable pour rétro-compatibilité admin)
 * - users.is_active (désactivation sans suppression) / users.must_change_password
 *   (mot de passe temporaire lors d'une création par admin)
 */
export class RolesRefactor1700000006000 implements MigrationInterface {
  name = 'RolesRefactor1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "org_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_products_org" ON "products" ("org_id")`);

    await queryRunner.query(`ALTER TABLE "users"
      ADD COLUMN "is_active" boolean NOT NULL DEFAULT true,
      ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users"
      DROP COLUMN IF EXISTS "must_change_password",
      DROP COLUMN IF EXISTS "is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_org"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "org_id"`);
  }
}
