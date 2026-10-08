import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roadmap MISSING F1-F6 :
 * - F1 : users.phone_enc / phone_hash (AES), sms_opt_out, marketing_opt_out,
 *        organizations.performance_score (badge vendeur)
 * - F2 : carts + cart_items (panier persistant), shipping_zones (frais de port)
 * - F3 : stock_movements (audit avant/après), shipments.pickup_code (QR C&C)
 * - F4 : org_documents (KYB)
 * - F5 : messages.reminder_sent_at (relance 24h), campaigns + campaign_recipients
 *        (stats newsletter), wishlists.price_at_add / was_in_stock (alertes),
 *        price_contracts.expiry_notified_at (alerte fin de contrat)
 * - F6 : momo_statements + momo_statement_lines (réconciliation), stock_forecasts
 */
export class MissingFeatures1700000005000 implements MigrationInterface {
  name = 'MissingFeatures1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── F1 : téléphone chiffré + préférences ────────────────────
    await queryRunner.query(`ALTER TABLE "users"
      ADD COLUMN "phone_enc" text,
      ADD COLUMN "phone_hash" varchar(64),
      ADD COLUMN "sms_opt_out" boolean NOT NULL DEFAULT false,
      ADD COLUMN "marketing_opt_out" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE INDEX "IDX_users_phone_hash" ON "users" ("phone_hash")`);
    // NB: l'ancienne colonne "phone" est conservée jusqu'au script de
    // migration des données scripts/encrypt-phones.ts, qui la supprime.

    await queryRunner.query(`ALTER TABLE "organizations"
      ADD COLUMN "performance_score" DECIMAL(5,2),
      ADD COLUMN "performance_computed_at" TIMESTAMP`);

    // ── F2 : panier persistant ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id"         uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid      NOT NULL UNIQUE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cart_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id"          uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "cart_id"     uuid      NOT NULL,
        "variant_id"  uuid      NOT NULL,
        "quantity"    int       NOT NULL CHECK ("quantity" > 0),
        "price_at_add" DECIMAL(12,2) NOT NULL,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ci_cart" FOREIGN KEY ("cart_id")
          REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ci_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_cart_variant" UNIQUE ("cart_id", "variant_id")
      )
    `);

    // ── F2 : zones de livraison ─────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "shipping_zone_type_enum" AS ENUM ('city','national','international');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "shipping_zones" (
        "id"              uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"          uuid      NOT NULL,
        "name"            varchar(100) NOT NULL,
        "zone_type"       "shipping_zone_type_enum" NOT NULL,
        "flat_rate"       DECIMAL(12,2) NOT NULL DEFAULT 0,
        "rate_per_kg"     DECIMAL(12,2) NOT NULL DEFAULT 0,
        "free_threshold"  DECIMAL(12,2),
        "estimated_days"  int,
        "is_express"      boolean   NOT NULL DEFAULT false,
        "express_surcharge_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
        "is_active"       boolean   NOT NULL DEFAULT true,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shipping_zones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sz_org" FOREIGN KEY ("org_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sz_org" ON "shipping_zones" ("org_id")`);

    // ── F3 : mouvements de stock (audit) ────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_movement_reason_enum" AS ENUM (
          'purchase','sale','return','damage','correction',
          'transfer_in','transfer_out','reservation','release');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "stock_movements" (
        "id"            uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "variant_id"    uuid      NOT NULL,
        "warehouse_id"  uuid,
        "reason"        "stock_movement_reason_enum" NOT NULL,
        "qty_delta"     int       NOT NULL,
        "qty_before"    int,
        "qty_after"     int,
        "user_id"       uuid,
        "order_id"      uuid,
        "note"          varchar(500),
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sm_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sm_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sm_variant_date" ON "stock_movements" ("variant_id", "created_at");
      CREATE INDEX "IDX_sm_warehouse"    ON "stock_movements" ("warehouse_id");
    `);

    // ── F3 : code de retrait Click & Collect ────────────────────
    await queryRunner.query(`ALTER TABLE "shipments" ADD COLUMN "pickup_code" varchar(12)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_shipments_pickup_code" ON "shipments" ("pickup_code") WHERE "pickup_code" IS NOT NULL`);

    // ── F4 : documents KYB ──────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "org_doc_type_enum" AS ENUM ('rccm','patente','statuts','id_card');
        CREATE TYPE "org_doc_status_enum" AS ENUM ('pending','approved','rejected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "org_documents" (
        "id"               uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "org_id"           uuid      NOT NULL,
        "type"             "org_doc_type_enum" NOT NULL,
        "file_url"         varchar(500) NOT NULL,
        "original_name"    varchar(255),
        "uploaded_by"      uuid,
        "status"           "org_doc_status_enum" NOT NULL DEFAULT 'pending',
        "reviewed_by"      uuid,
        "reviewed_at"      TIMESTAMP,
        "rejection_reason" varchar(300),
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_od_org" FOREIGN KEY ("org_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_od_org_status" ON "org_documents" ("org_id", "status")`);

    // ── F5 : relance messagerie ─────────────────────────────────
    await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "reminder_sent_at" TIMESTAMP`);

    // ── F5 : campagnes newsletter persistées ────────────────────
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id"          uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "subject"     varchar(200) NOT NULL,
        "body"        text      NOT NULL,
        "audience"    varchar(20) NOT NULL DEFAULT 'all',
        "status"      varchar(20) NOT NULL DEFAULT 'sent',
        "sent_at"     TIMESTAMP,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "campaign_recipients" (
        "id"          uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid      NOT NULL,
        "user_id"     uuid,
        "email"       varchar(255) NOT NULL,
        "token"       varchar(64) NOT NULL UNIQUE,
        "opened_at"   TIMESTAMP,
        "clicked_at"  TIMESTAMP,
        "unsubscribed_at" TIMESTAMP,
        CONSTRAINT "PK_campaign_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cr_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cr_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cr_campaign" ON "campaign_recipients" ("campaign_id")`);

    // ── F5 : snapshot wishlist (alertes prix/stock) ─────────────
    await queryRunner.query(`ALTER TABLE "wishlists"
      ADD COLUMN "price_at_add" DECIMAL(12,2),
      ADD COLUMN "was_in_stock" boolean NOT NULL DEFAULT true`);

    // ── F5 : alerte fin de contrat ──────────────────────────────
    await queryRunner.query(`ALTER TABLE "price_contracts" ADD COLUMN "expiry_notified_at" TIMESTAMP`);

    // ── F6 : réconciliation MoMo ────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "recon_match_status_enum" AS ENUM (
          'matched','missing_in_platform','missing_at_operator','amount_mismatch','resolved');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE "momo_statements" (
        "id"           uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "provider"     varchar(20) NOT NULL DEFAULT 'mtn',
        "period_label" varchar(50) NOT NULL,
        "file_name"    varchar(255),
        "imported_by"  uuid,
        "line_count"   int       NOT NULL DEFAULT 0,
        "matched_count" int      NOT NULL DEFAULT 0,
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_momo_statements" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "momo_statement_lines" (
        "id"                 uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "statement_id"       uuid      NOT NULL,
        "external_ref"       varchar(255) NOT NULL,
        "amount"             DECIMAL(12,2) NOT NULL,
        "operator_status"    varchar(30),
        "occurred_at"        TIMESTAMP,
        "match_status"       "recon_match_status_enum" NOT NULL,
        "matched_payment_id" uuid,
        "note"               varchar(300),
        CONSTRAINT "PK_momo_statement_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_msl_statement" FOREIGN KEY ("statement_id")
          REFERENCES "momo_statements"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_msl_statement" ON "momo_statement_lines" ("statement_id")`);

    // ── F6 : prévisions de stock ────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "stock_forecasts" (
        "id"                  uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "variant_id"          uuid      NOT NULL,
        "org_id"              uuid      NOT NULL,
        "horizon_days"        int       NOT NULL DEFAULT 30,
        "avg_daily_sales"     DECIMAL(10,4),
        "forecast_qty"        int       NOT NULL DEFAULT 0,
        "available_qty"       int       NOT NULL DEFAULT 0,
        "reorder_point"       int       NOT NULL DEFAULT 0,
        "recommended_reorder_qty" int   NOT NULL DEFAULT 0,
        "method"              varchar(30) NOT NULL DEFAULT 'moving_average',
        "computed_at"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_forecasts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sf_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sf_org" ON "stock_forecasts" ("org_id", "computed_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_forecasts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "momo_statement_lines" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "momo_statements" CASCADE`);
    await queryRunner.query(`ALTER TABLE "price_contracts" DROP COLUMN IF EXISTS "expiry_notified_at"`);
    await queryRunner.query(`ALTER TABLE "wishlists" DROP COLUMN IF EXISTS "was_in_stock"`);
    await queryRunner.query(`ALTER TABLE "wishlists" DROP COLUMN IF EXISTS "price_at_add"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_recipients" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns" CASCADE`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN IF EXISTS "reminder_sent_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_documents" CASCADE`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_shipments_pickup_code"`);
    await queryRunner.query(`ALTER TABLE "shipments" DROP COLUMN IF EXISTS "pickup_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipping_zones" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carts" CASCADE`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "performance_computed_at"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "performance_score"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_phone_hash"`);
    await queryRunner.query(`ALTER TABLE "users"
      DROP COLUMN IF EXISTS "marketing_opt_out",
      DROP COLUMN IF EXISTS "sms_opt_out",
      DROP COLUMN IF EXISTS "phone_hash",
      DROP COLUMN IF EXISTS "phone_enc"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "recon_match_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "org_doc_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "org_doc_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_movement_reason_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "shipping_zone_type_enum"`);
  }
}
