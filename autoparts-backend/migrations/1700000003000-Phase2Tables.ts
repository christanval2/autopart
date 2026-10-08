import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2Tables1700000003000 implements MigrationInterface {
  name = 'Phase2Tables1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Chat sessions (chatbot IA)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_sessions" (
        "id"          uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"     uuid,
        "session_key" varchar(100) NOT NULL UNIQUE,
        "messages"    jsonb        NOT NULL DEFAULT '[]',
        "context"     jsonb,
        "created_at"  TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cs_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cs_key"  ON "chat_sessions" ("session_key")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cs_user" ON "chat_sessions" ("user_id")`);

    // Audit trail
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"          uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "actor_id"    uuid,
        "actor_email" varchar(255),
        "actor_roles" text,
        "action"      varchar(100) NOT NULL,
        "entity"      varchar(100) NOT NULL,
        "entity_id"   varchar(100),
        "before"      jsonb,
        "after"       jsonb,
        "ip_address"  varchar(45),
        "user_agent"  varchar(500),
        "metadata"    jsonb,
        "created_at"  TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_al_actor" FOREIGN KEY ("actor_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_al_entity"  ON "audit_logs" ("entity","entity_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_al_action"  ON "audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_al_created" ON "audit_logs" ("created_at")`);

    // Colonne expo_push_token sur users (notifications push)
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "expo_push_token" varchar(200)
    `);

    // Index stock pour les performances (SELECT FOR UPDATE)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_variant_warehouse"
        ON "stock_levels" ("variant_id","warehouse_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions" CASCADE`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "expo_push_token"`);
  }
}
