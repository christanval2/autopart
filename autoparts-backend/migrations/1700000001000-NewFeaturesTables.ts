import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewFeaturesTables1700000001000 implements MigrationInterface {
  name = 'NewFeaturesTables1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // auth-6 : 2FA
    await queryRunner.query(`
      CREATE TABLE "two_factor_auth" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL UNIQUE,
        "secret" varchar(100) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "backup_codes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_2fa" PRIMARY KEY ("id"),
        CONSTRAINT "FK_2fa_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // price-3 : Devis B2B
    await queryRunner.query(`
      CREATE TYPE "quote_status_enum" AS ENUM('draft','sent','accepted','rejected','expired','converted');
      CREATE TABLE "quotes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "quote_number" varchar(30) NOT NULL UNIQUE,
        "buyer_id" uuid NOT NULL,
        "seller_org_id" uuid NOT NULL,
        "status" "quote_status_enum" NOT NULL DEFAULT 'draft',
        "valid_until" date NOT NULL,
        "subtotal" decimal(12,2) NOT NULL,
        "discount_pct" decimal(5,2) NOT NULL DEFAULT 0,
        "total_amount" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "notes" text,
        "lines" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quotes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quotes_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_quotes_org" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id")
      )
    `);

    // price-4 : Promotions
    await queryRunner.query(`
      CREATE TYPE "promo_type_enum"  AS ENUM('percentage','fixed','free_shipping','bogo');
      CREATE TYPE "promo_scope_enum" AS ENUM('all','category','product','org');
      CREATE TABLE "promotions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(50) NOT NULL UNIQUE,
        "name" varchar(200) NOT NULL,
        "type"           "promo_type_enum"  NOT NULL,
        "scope"          "promo_scope_enum" NOT NULL DEFAULT 'all',
        "discount_value" decimal(10,2) NOT NULL,
        "min_order_amount" decimal(12,2) NOT NULL DEFAULT 0,
        "max_uses" integer,
        "uses_count" integer NOT NULL DEFAULT 0,
        "max_uses_per_user" integer NOT NULL DEFAULT 1,
        "valid_from" TIMESTAMP NOT NULL,
        "valid_until" TIMESTAMP NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "scope_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promotions" PRIMARY KEY ("id")
      )
    `);

    // cat-8 : Bundles/Kits
    await queryRunner.query(`
      CREATE TABLE "bundles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "bundle_price" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bundles" PRIMARY KEY ("id")
      );
      CREATE TABLE "bundle_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bundle_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_bundle_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bi_bundle" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bi_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);

    // ord-5 : Approbation B2B
    await queryRunner.query(`
      CREATE TYPE "approval_status_enum" AS ENUM('pending','approved','rejected');
      CREATE TABLE "order_approvals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "approver_id" uuid,
        "status" "approval_status_enum" NOT NULL DEFAULT 'pending',
        "reason" text,
        "threshold_amount" decimal(12,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "decided_at" TIMESTAMP,
        CONSTRAINT "PK_order_approvals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_oa_order"    FOREIGN KEY ("order_id")    REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_oa_approver" FOREIGN KEY ("approver_id") REFERENCES "users"("id")  ON DELETE SET NULL
      )
    `);

    // ord-6 : Commandes récurrentes
    await queryRunner.query(`
      CREATE TYPE "recurrence_freq_enum" AS ENUM('daily','weekly','biweekly','monthly');
      CREATE TABLE "recurring_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "buyer_id" uuid NOT NULL,
        "seller_org_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "frequency" "recurrence_freq_enum" NOT NULL,
        "template" jsonb NOT NULL,
        "next_run_at" TIMESTAMP NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "billing_address_id" uuid,
        "shipping_address_id" uuid,
        "runs_count" integer NOT NULL DEFAULT 0,
        "last_run_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recurring_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ro_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_ro_org"   FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id")
      )
    `);

    // shp-4 : Retours
    await queryRunner.query(`
      CREATE TYPE "return_status_enum" AS ENUM('requested','approved','rejected','shipped_back','received','refunded');
      CREATE TYPE "return_reason_enum" AS ENUM('defective','wrong_item','not_as_described','changed_mind','damaged_shipping','other');
      CREATE TABLE "return_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "requester_id" uuid NOT NULL,
        "status"  "return_status_enum" NOT NULL DEFAULT 'requested',
        "reason"  "return_reason_enum" NOT NULL,
        "description" text,
        "lines" jsonb,
        "return_tracking" varchar(100),
        "refund_amount" decimal(12,2),
        "resolved_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rr_order"     FOREIGN KEY ("order_id")     REFERENCES "orders"("id"),
        CONSTRAINT "FK_rr_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id")
      )
    `);

    // adm-5 : Litiges
    await queryRunner.query(`
      CREATE TYPE "dispute_status_enum" AS ENUM('open','under_review','resolved_buyer','resolved_seller','closed');
      CREATE TYPE "dispute_type_enum"   AS ENUM('not_received','wrong_item','quality','payment','other');
      CREATE TABLE "disputes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "claimant_id" uuid NOT NULL,
        "assigned_to" uuid,
        "status"      "dispute_status_enum" NOT NULL DEFAULT 'open',
        "type"        "dispute_type_enum"   NOT NULL,
        "description" text NOT NULL,
        "resolution_notes" text,
        "evidence_urls" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disputes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_disp_order"    FOREIGN KEY ("order_id")    REFERENCES "orders"("id"),
        CONSTRAINT "FK_disp_claimant" FOREIGN KEY ("claimant_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_disp_assigned" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // adm-3 : Commissions
    await queryRunner.query(`
      CREATE TYPE "commission_status_enum" AS ENUM('pending','validated','paid','cancelled');
      CREATE TABLE "commissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "seller_org_id" uuid NOT NULL,
        "rate_pct" decimal(5,2) NOT NULL,
        "base_amount" decimal(12,2) NOT NULL,
        "commission_amount" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "status" "commission_status_enum" NOT NULL DEFAULT 'pending',
        "paid_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_comm_order" FOREIGN KEY ("order_id")    REFERENCES "orders"("id"),
        CONSTRAINT "FK_comm_org"   FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id")
      )
    `);

    // stk-5 : Picking
    await queryRunner.query(`
      CREATE TYPE "pick_list_status_enum" AS ENUM('pending','in_progress','completed','cancelled');
      CREATE TABLE "pick_lists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "picker_id" uuid,
        "status" "pick_list_status_enum" NOT NULL DEFAULT 'pending',
        "items" jsonb NOT NULL,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pick_lists" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pl_order"   FOREIGN KEY ("order_id")    REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pl_wh"      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id"),
        CONSTRAINT "FK_pl_picker"  FOREIGN KEY ("picker_id")   REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // stk-6 : Inventaire audit
    await queryRunner.query(`
      CREATE TYPE "audit_status_enum" AS ENUM('planned','in_progress','completed','cancelled');
      CREATE TABLE "stock_audits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "warehouse_id" uuid NOT NULL,
        "conducted_by" uuid NOT NULL,
        "status" "audit_status_enum" NOT NULL DEFAULT 'planned',
        "planned_date" TIMESTAMP NOT NULL,
        "completed_date" TIMESTAMP,
        "results" jsonb,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_audits" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sa_wh"   FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id"),
        CONSTRAINT "FK_sa_user" FOREIGN KEY ("conducted_by") REFERENCES "users"("id")
      )
    `);

    // stk-7 : Bons de commande fournisseur
    await queryRunner.query(`
      CREATE TYPE "po_status_enum" AS ENUM('draft','sent','confirmed','partial','received','cancelled');
      CREATE TABLE "purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "po_number" varchar(30) NOT NULL UNIQUE,
        "buyer_org_id" uuid NOT NULL,
        "supplier_name" varchar(255) NOT NULL,
        "supplier_email" varchar(255),
        "warehouse_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "status" "po_status_enum" NOT NULL DEFAULT 'draft',
        "lines" jsonb NOT NULL,
        "total_amount" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "expected_at" TIMESTAMP,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_po_org"  FOREIGN KEY ("buyer_org_id") REFERENCES "organizations"("id"),
        CONSTRAINT "FK_po_wh"   FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id"),
        CONSTRAINT "FK_po_user" FOREIGN KEY ("created_by")   REFERENCES "users"("id")
      )
    `);

    // mob-5 : Wishlist
    await queryRunner.query(`
      CREATE TABLE "wishlists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "note" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wishlists" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wishlist" UNIQUE ("user_id","product_id"),
        CONSTRAINT "FK_wl_user"    FOREIGN KEY ("user_id")    REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wl_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // notif-4 : Messagerie interne
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sender_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "order_id" uuid,
        "subject" varchar(200),
        "body" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "attachments" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_msg_sender"    FOREIGN KEY ("sender_id")    REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_msg_recipient" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_msg_order"     FOREIGN KEY ("order_id")     REFERENCES "orders"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_messages_recipient" ON "messages" ("recipient_id","is_read");
      CREATE INDEX "IDX_messages_sender"    ON "messages" ("sender_id");
    `);

    // rev-3 : Fidélité
    await queryRunner.query(`
      CREATE TYPE "loyalty_tx_type_enum" AS ENUM('earned','redeemed','expired','bonus','adjustment');
      CREATE TABLE "loyalty_points" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "order_id" uuid,
        "type" "loyalty_tx_type_enum" NOT NULL,
        "points" integer NOT NULL,
        "balance_after" integer NOT NULL,
        "description" varchar(200),
        "expires_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_points" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lp_user"  FOREIGN KEY ("user_id")  REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lp_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_loyalty_user" ON "loyalty_points" ("user_id");
    `);

    // rev-4 : Q&A
    await queryRunner.query(`
      CREATE TABLE "product_qa" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "asker_id" uuid NOT NULL,
        "answerer_id" uuid,
        "question" text NOT NULL,
        "answer" text,
        "is_public" boolean NOT NULL DEFAULT true,
        "answered_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_qa" PRIMARY KEY ("id"),
        CONSTRAINT "FK_qa_product"  FOREIGN KEY ("product_id")  REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_qa_asker"    FOREIGN KEY ("asker_id")    REFERENCES "users"("id"),
        CONSTRAINT "FK_qa_answerer" FOREIGN KEY ("answerer_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // cat-9 : Historique des prix
    await queryRunner.query(`
      CREATE TABLE "price_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "changed_by" uuid,
        "old_price" decimal(12,2) NOT NULL,
        "new_price" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "reason" varchar(200),
        "changed_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ph_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ph_user"    FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL
      );
      CREATE INDEX "IDX_price_history_product" ON "price_history" ("product_id","changed_at");
    `);

    // srch-5 : Historique de recherche
    await queryRunner.query(`
      CREATE TABLE "search_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "session_id" varchar(100),
        "query" varchar(300) NOT NULL,
        "results_count" integer NOT NULL DEFAULT 0,
        "search_type" varchar(30) NOT NULL DEFAULT 'text',
        "filters" jsonb,
        "searched_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_search_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sh_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_search_history_user" ON "search_history" ("user_id","searched_at");
    `);

    // pay-7 : Wallet
    await queryRunner.query(`
      CREATE TYPE "wallet_tx_type_enum" AS ENUM('credit','debit','refund','adjustment');
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL UNIQUE,
        "balance" decimal(15,2) NOT NULL DEFAULT 0,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
      CREATE TABLE "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "wallet_id" uuid NOT NULL,
        "order_id" uuid,
        "type" "wallet_tx_type_enum" NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "balance_after" decimal(15,2) NOT NULL,
        "description" varchar(200),
        "reference" varchar(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_tx" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wtx_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id"),
        CONSTRAINT "FK_wtx_order"  FOREIGN KEY ("order_id")  REFERENCES "orders"("id") ON DELETE SET NULL
      )
    `);

    // mob-6 : Géolocalisation vendeurs
    await queryRunner.query(`
      CREATE TABLE "seller_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL UNIQUE,
        "latitude" decimal(10,8) NOT NULL,
        "longitude" decimal(11,8) NOT NULL,
        "address" varchar(255),
        "city" varchar(100),
        "is_visible" boolean NOT NULL DEFAULT true,
        "categories" text,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seller_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sl_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'seller_locations','wallet_transactions','wallets','search_history','price_history',
      'product_qa','loyalty_points','messages','wishlists','purchase_orders',
      'stock_audits','pick_lists','commissions','disputes','return_requests',
      'recurring_orders','order_approvals','bundle_items','bundles','promotions','quotes','two_factor_auth',
    ];
    for (const t of tables) await queryRunner.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    const types = [
      'quote_status_enum','promo_type_enum','promo_scope_enum','approval_status_enum',
      'recurrence_freq_enum','return_status_enum','return_reason_enum','dispute_status_enum',
      'dispute_type_enum','commission_status_enum','pick_list_status_enum','audit_status_enum',
      'po_status_enum','loyalty_tx_type_enum','wallet_tx_type_enum',
    ];
    for (const t of types) await queryRunner.query(`DROP TYPE IF EXISTS "${t}"`);
  }
}

// Extension : tables price_contracts et srch-6 stub
// (appended via patch — ces tables sont créées dans la migration principale ci-dessus)
// Note: Ajouter dans la méthode up() après les autres tables :
// await queryRunner.query(`
//   CREATE TABLE "chat_sessions" (
//     "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
//     "user_id" uuid,
//     "session_key" varchar(100) NOT NULL UNIQUE,
//     "messages" jsonb NOT NULL DEFAULT '[]',
//     "context" jsonb,
//     "created_at" TIMESTAMP NOT NULL DEFAULT now(),
//     "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
//     CONSTRAINT "PK_chat_sessions" PRIMARY KEY ("id"),
//     CONSTRAINT "FK_cs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
//   );
//   CREATE INDEX "IDX_chat_sessions_key" ON "chat_sessions" ("session_key");
// `);
