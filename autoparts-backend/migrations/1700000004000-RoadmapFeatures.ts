import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roadmap Features E1-E6 :
 * - users.expo_push_token (E2 push mobile)
 * - organizations.approval_threshold (E3 checkout B2B)
 * - refunds (E4 remboursements)
 * - wallet_recharges / wallet_withdrawals (E4 wallet)
 * - product_images.sizes (E5 multi-tailles)
 * - reviews : modération + réponse vendeur (E6)
 * - org_invitations (E6 membres)
 * - consent_logs (E6 RGPD)
 * - tax_configs (E6 TVA configurable)
 * - product_events (E6 funnel analytics)
 */
export class RoadmapFeatures1700000004000 implements MigrationInterface {
  name = 'RoadmapFeatures1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── E2 : token push Expo ────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "expo_push_token" varchar(255)`);

    // ── E3 : seuil d'approbation B2B ────────────────────────────
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "approval_threshold" DECIMAL(15,2)`);

    // ── E4 : remboursements ─────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "refund_method_enum" AS ENUM ('momo','bank_transfer','wallet');
        CREATE TYPE "refund_status_enum" AS ENUM ('pending','processing','completed','failed','pending_manual');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "refunds" (
        "id"           uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id"   uuid         NOT NULL,
        "processed_by" uuid,
        "amount"       DECIMAL(12,2) NOT NULL,
        "method"       "refund_method_enum"   NOT NULL,
        "status"       "refund_status_enum"   NOT NULL DEFAULT 'pending',
        "reason"       varchar(500) NOT NULL,
        "gateway_ref"  varchar(255),
        "proof"        varchar(500),
        "created_at"   TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refund_payment" FOREIGN KEY ("payment_id")
          REFERENCES "payments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refund_user" FOREIGN KEY ("processed_by")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_refund_amount" CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refunds_payment" ON "refunds" ("payment_id")`);

    // ── E4 : recharges wallet ───────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "wallet_recharge_status_enum" AS ENUM ('pending','completed','failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "wallet_recharges" (
        "id"          uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"     uuid         NOT NULL,
        "amount"      DECIMAL(12,2) NOT NULL,
        "currency"    varchar(3)   NOT NULL DEFAULT 'XAF',
        "provider"    varchar(10)  NOT NULL,
        "phone"       varchar(20)  NOT NULL,
        "gateway_ref" varchar(255) NOT NULL UNIQUE,
        "status"      "wallet_recharge_status_enum" NOT NULL DEFAULT 'pending',
        "processed_at" TIMESTAMP,
        "created_at"  TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_recharges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wr_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_wr_amount" CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wr_user" ON "wallet_recharges" ("user_id")`);

    // ── E4 : retraits wallet ────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "withdrawal_status_enum" AS ENUM ('pending','approved','rejected','paid','failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "wallet_withdrawals" (
        "id"               uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"          uuid         NOT NULL,
        "processed_by"     uuid,
        "amount"           DECIMAL(12,2) NOT NULL,
        "currency"         varchar(3)   NOT NULL DEFAULT 'XAF',
        "phone"            varchar(20)  NOT NULL,
        "status"           "withdrawal_status_enum" NOT NULL DEFAULT 'pending',
        "rejection_reason" varchar(300),
        "gateway_ref"      varchar(255),
        "created_at"       TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_withdrawals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ww_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ww_processor" FOREIGN KEY ("processed_by")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ww_amount" CHECK ("amount" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ww_user" ON "wallet_withdrawals" ("user_id")`);

    // ── E5 : tailles d'images ───────────────────────────────────
    await queryRunner.query(`ALTER TABLE "product_images" ADD COLUMN "sizes" jsonb`);

    // ── E6 : modération avis + réponse vendeur ──────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "review_status_enum" AS ENUM ('approved','pending','rejected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "status" "review_status_enum" NOT NULL DEFAULT 'approved'`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "rejection_reason" varchar(300)`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "seller_reply" text`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "seller_replied_at" TIMESTAMP`);

    // ── E6 : invitations organisation ───────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "invitation_role_enum" AS ENUM ('org_admin','seller','buyer','logistics','accountant');
        CREATE TYPE "invitation_status_enum" AS ENUM ('pending','accepted','expired','revoked');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "org_invitations" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"     uuid         NOT NULL,
        "email"      varchar(255) NOT NULL,
        "role"       "invitation_role_enum" NOT NULL,
        "token"      varchar(100) NOT NULL UNIQUE,
        "status"     "invitation_status_enum" NOT NULL DEFAULT 'pending',
        "expires_at" TIMESTAMP    NOT NULL,
        "created_at" TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inv_org" FOREIGN KEY ("org_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_inv_org" ON "org_invitations" ("org_id")`);

    // ── E6 : consentements RGPD ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "consent_logs" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid         NOT NULL,
        "type"       varchar(50)  NOT NULL,
        "version"    varchar(20)  NOT NULL,
        "accepted"   boolean      NOT NULL DEFAULT true,
        "ip"         varchar(64),
        "created_at" TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consent_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_consent_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_consent_user" ON "consent_logs" ("user_id")`);

    // ── E6 : TVA configurable ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tax_configs" (
        "id"                      uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "country_code"            varchar(2)   NOT NULL,
        "rate"                    DECIMAL(5,4) NOT NULL,
        "is_active"               boolean      NOT NULL DEFAULT true,
        "exempted_category_ids"   jsonb        NOT NULL DEFAULT '[]',
        "created_at"              TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tax_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tax_country" UNIQUE ("country_code")
      )
    `);
    // Seed : TVA Cameroun 19,25 %
    await queryRunner.query(`
      INSERT INTO "tax_configs" ("country_code", "rate")
      VALUES ('CM', 0.1925)
      ON CONFLICT ("country_code") DO NOTHING
    `);

    // ── E6 : événements produits (funnel) ───────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "product_event_type_enum" AS ENUM ('view','cart','purchase');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "product_events" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid         NOT NULL,
        "user_id"    uuid,
        "type"       "product_event_type_enum" NOT NULL,
        "created_at" TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pe_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pe_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_pe_product_type" ON "product_events" ("product_id", "type")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_configs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consent_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_invitations" CASCADE`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "seller_replied_at"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "seller_reply"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "rejection_reason"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN IF EXISTS "sizes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_withdrawals" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_recharges" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds" CASCADE`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "approval_threshold"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "expo_push_token"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "product_event_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "review_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invitation_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "invitation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "withdrawal_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wallet_recharge_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "refund_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "refund_status_enum"`);
  }
}
