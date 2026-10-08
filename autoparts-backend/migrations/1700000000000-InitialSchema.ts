import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "unaccent"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    // org_tiers
    await queryRunner.query(`
      CREATE TABLE "org_tiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(50) NOT NULL,
        "discount_rate" decimal(5,2) NOT NULL DEFAULT 0,
        "min_order_qty" integer NOT NULL DEFAULT 1,
        "min_order_value" decimal(12,2) NOT NULL DEFAULT 0,
        "can_buy_wholesale" boolean NOT NULL DEFAULT false,
        "can_sell" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_org_tiers" PRIMARY KEY ("id")
      )
    `);

    // organizations
    await queryRunner.query(`
      CREATE TYPE "org_type_enum" AS ENUM('importer','wholesaler','retailer','garage');
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "org_type" "org_type_enum" NOT NULL,
        "tax_id" varchar(50),
        "country_code" char(2) NOT NULL,
        "parent_org_id" uuid,
        "tier_id" uuid,
        "is_verified" boolean NOT NULL DEFAULT false,
        "credit_limit" decimal(15,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organizations_tax_id" UNIQUE ("tax_id"),
        CONSTRAINT "FK_organizations_parent" FOREIGN KEY ("parent_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_organizations_tier" FOREIGN KEY ("tier_id") REFERENCES "org_tiers"("id") ON DELETE SET NULL
      )
    `);

    // users
    await queryRunner.query(`
      CREATE TYPE "account_type_enum" AS ENUM('individual','pro','admin');
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "phone" varchar(20),
        "password_hash" varchar(255) NOT NULL,
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100) NOT NULL,
        "org_id" uuid,
        "account_type" "account_type_enum" NOT NULL DEFAULT 'individual',
        "roles" text NOT NULL DEFAULT 'buyer',
        "is_verified" boolean NOT NULL DEFAULT false,
        "last_login_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "FK_users_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL
      )
    `);

    // categories
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "parent_id" uuid,
        "slug" varchar(150) NOT NULL,
        "depth" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);

    // brands
    await queryRunner.query(`
      CREATE TABLE "brands" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "country_of_origin" char(2),
        "is_oem" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_brands" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_brands_name" UNIQUE ("name")
      )
    `);

    // products
    await queryRunner.query(`
      CREATE TYPE "product_condition_enum" AS ENUM('new','genuine_used','reconditioned');
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sku" varchar(100) NOT NULL,
        "oem_reference" varchar(100),
        "name" varchar(255) NOT NULL,
        "description" text,
        "category_id" uuid NOT NULL,
        "brand_id" uuid NOT NULL,
        "base_price" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "weight_kg" float,
        "dimensions_cm" jsonb,
        "condition" "product_condition_enum" NOT NULL DEFAULT 'new',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_products_sku" UNIQUE ("sku"),
        CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id"),
        CONSTRAINT "FK_products_brand" FOREIGN KEY ("brand_id") REFERENCES "brands"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_products_oem" ON "products" ("oem_reference")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_fts" ON "products" USING gin(to_tsvector('french', coalesce(name,'') || ' ' || coalesce(description,'')))`);

    // product_variants
    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "variant_sku" varchar(120) NOT NULL,
        "attributes" jsonb NOT NULL DEFAULT '{}',
        "price_override" decimal(12,2),
        "cost_price" decimal(12,2) NOT NULL,
        "reorder_point" integer NOT NULL DEFAULT 5,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_product_variants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_variant_sku" UNIQUE ("variant_sku"),
        CONSTRAINT "FK_variants_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // product_compatibilities
    await queryRunner.query(`
      CREATE TABLE "product_compatibilities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "make" varchar(80) NOT NULL,
        "model" varchar(80) NOT NULL,
        "year_from" integer NOT NULL,
        "year_to" integer,
        "engine_code" varchar(50),
        CONSTRAINT "PK_compatibilities" PRIMARY KEY ("id"),
        CONSTRAINT "FK_compat_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_compat_make_model" ON "product_compatibilities" ("make","model")`);

    // product_images
    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "url" varchar(500) NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_product_images" PRIMARY KEY ("id"),
        CONSTRAINT "FK_images_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // catalogs
    await queryRunner.query(`
      CREATE TYPE "catalog_visibility_enum" AS ENUM('public','private','b2b_only');
      CREATE TABLE "catalogs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "visibility" "catalog_visibility_enum" NOT NULL DEFAULT 'b2b_only',
        "markup_pct" decimal(5,2) NOT NULL DEFAULT 0,
        "valid_from" date,
        "valid_until" date,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_catalogs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_catalogs_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // catalog_products
    await queryRunner.query(`
      CREATE TABLE "catalog_products" (
        "catalog_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "custom_price" decimal(12,2),
        "min_qty" integer NOT NULL DEFAULT 1,
        "max_qty" integer,
        "is_available" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_catalog_products" PRIMARY KEY ("catalog_id","variant_id"),
        CONSTRAINT "FK_cp_catalog" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cp_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);

    // warehouses
    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "country_code" char(2) NOT NULL,
        "city" varchar(100) NOT NULL,
        "address" text,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wh_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // stock_levels
    await queryRunner.query(`
      CREATE TABLE "stock_levels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "warehouse_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "qty_on_hand" integer NOT NULL DEFAULT 0,
        "qty_reserved" integer NOT NULL DEFAULT 0,
        "last_updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_levels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stock_wh_variant" UNIQUE ("warehouse_id","variant_id"),
        CONSTRAINT "FK_stock_wh" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);

    // addresses, orders, order_lines, payments, shipments, reviews, notifications
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "label" varchar(50),
        "street" text NOT NULL,
        "city" varchar(100) NOT NULL,
        "postal_code" varchar(20),
        "country_code" char(2) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_addr_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM('draft','confirmed','processing','shipped','delivered','cancelled','refunded');
      CREATE TYPE "order_channel_enum" AS ENUM('b2b','b2c','marketplace');
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_number" varchar(30) NOT NULL,
        "buyer_id" uuid NOT NULL,
        "seller_org_id" uuid NOT NULL,
        "channel" "order_channel_enum" NOT NULL,
        "status" "order_status_enum" NOT NULL DEFAULT 'draft',
        "subtotal" decimal(12,2) NOT NULL,
        "tax_amount" decimal(12,2) NOT NULL DEFAULT 0,
        "shipping_cost" decimal(12,2) NOT NULL DEFAULT 0,
        "discount_amount" decimal(12,2) NOT NULL DEFAULT 0,
        "total_amount" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'XAF',
        "billing_address_id" uuid,
        "shipping_address_id" uuid,
        "notes" text,
        "ordered_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_number" UNIQUE ("order_number"),
        CONSTRAINT "FK_orders_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_orders_seller" FOREIGN KEY ("seller_org_id") REFERENCES "organizations"("id"),
        CONSTRAINT "FK_orders_billing" FOREIGN KEY ("billing_address_id") REFERENCES "addresses"("id"),
        CONSTRAINT "FK_orders_shipping" FOREIGN KEY ("shipping_address_id") REFERENCES "addresses"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "product_snapshot" jsonb NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" decimal(12,2) NOT NULL,
        "line_total" decimal(12,2) NOT NULL,
        "tax_rate" decimal(5,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ol_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ol_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_method_enum" AS ENUM('mobile_money','bank_transfer','cash','credit','card');
      CREATE TYPE "payment_status_enum" AS ENUM('pending','processing','completed','failed','refunded');
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "method" "payment_method_enum" NOT NULL,
        "status" "payment_status_enum" NOT NULL DEFAULT 'pending',
        "amount" decimal(12,2) NOT NULL,
        "currency" char(3) NOT NULL,
        "gateway_ref" varchar(255) NOT NULL,
        "gateway_response" jsonb,
        "paid_at" TIMESTAMP,
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_order" UNIQUE ("order_id"),
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "shipment_status_enum" AS ENUM('preparing','in_transit','out_for_delivery','delivered','returned');
      CREATE TABLE "shipments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "warehouse_id" uuid,
        "tracking_number" varchar(100),
        "carrier" varchar(80),
        "status" "shipment_status_enum" NOT NULL DEFAULT 'preparing',
        "shipped_at" TIMESTAMP,
        "delivered_at" TIMESTAMP,
        "parcel_info" jsonb,
        CONSTRAINT "PK_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ship_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ship_wh" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reviewer_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "order_id" uuid,
        "rating" integer NOT NULL DEFAULT 5,
        "comment" text,
        "is_verified_purchase" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_rating" CHECK ("rating" BETWEEN 1 AND 5),
        CONSTRAINT "FK_reviews_user" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_reviews_product" FOREIGN KEY ("product_id") REFERENCES "products"("id"),
        CONSTRAINT "FK_reviews_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notif_type_enum" AS ENUM('order_update','stock_alert','payment','promo','system');
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "notif_type_enum" NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text,
        "payload" jsonb,
        "is_read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notif_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_notif_user_read" ON "notifications" ("user_id","is_read")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_buyer" ON "orders" ("buyer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_seller" ON "orders" ("seller_org_id","status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'notifications','reviews','shipments','payments','order_lines','orders',
      'addresses','stock_levels','warehouses','catalog_products','catalogs',
      'product_images','product_compatibilities','product_variants','products',
      'brands','categories','catalogs','users','organizations','org_tiers',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
    const types = [
      'notif_type_enum','shipment_status_enum','payment_status_enum',
      'payment_method_enum','order_channel_enum','order_status_enum',
      'catalog_visibility_enum','product_condition_enum','org_type_enum','account_type_enum',
    ];
    for (const t of types) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${t}"`);
    }
  }
}
