import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatSessions1700000002000 implements MigrationInterface {
  name = 'ChatSessions1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_sessions" (
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
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_sessions_key"  ON "chat_sessions" ("session_key");
      CREATE INDEX "IDX_chat_sessions_user" ON "chat_sessions" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions" CASCADE`);
  }
}
