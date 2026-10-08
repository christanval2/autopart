import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R-roadmap — alignement des colonnes de relations legacy sur snake_case.
 * Ces colonnes avaient été créées par `synchronize: true` (era avant sa
 * désactivation) en camelCase ; le reste de la base est en snake_case.
 * Renommage conditionnel : ne touche que les colonnes camelCase existantes
 * (les bases fraîches créées par InitialSchema sont déjà en snake_case).
 */
export class SnakeCaseRelations1700000007000 implements MigrationInterface {
  name = 'SnakeCaseRelations1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_name, column_name,
                 lower(regexp_replace(column_name, '([A-Z])', '_\\1', 'g')) AS snake_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name ~ '[A-Z]'
            AND table_name IN ('categories','organizations','product_compatibilities',
                               'product_images','product_variants','products','stock_levels')
        LOOP
          IF EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public'
                       AND table_name = r.table_name
                       AND column_name = r.snake_name) THEN
            -- La cible snake existe déjà (héritage synchronize) : la colonne
            -- camel est redondante, on la supprime.
            EXECUTE format('ALTER TABLE %I DROP COLUMN %I', r.table_name, r.column_name);
            RAISE NOTICE 'Supprimé (snake déjà présent): %.%', r.table_name, r.column_name;
          ELSE
            EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I',
                           r.table_name, r.column_name, r.snake_name);
            RAISE NOTICE 'Renommé: %.% -> %', r.table_name, r.column_name, r.snake_name;
          END IF;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name ~ '_[a-z]'
            AND table_name IN ('categories','organizations','product_compatibilities',
                               'product_images','product_variants','products','stock_levels')
            AND column_name IN ('parent_id','tier_id','product_id','category_id','brand_id',
                                'warehouse_id','variant_id')
        LOOP
          BEGIN
            EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I',
                           r.table_name, r.column_name,
                           regexp_replace(r.column_name, '_([a-z])', upper('\\1'), 'g'));
          EXCEPTION WHEN duplicate_column THEN NULL;
          END;
        END LOOP;
      END $$;
    `);
  }
}
