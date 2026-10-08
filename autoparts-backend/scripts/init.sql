-- Extensions PostgreSQL nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Configuration dictionnaire français pour full-text search
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'french_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION french_unaccent (COPY = french);
    ALTER TEXT SEARCH CONFIGURATION french_unaccent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
  END IF;
END $$;

-- Base de données de test
CREATE DATABASE autoparts_test WITH OWNER autoparts TEMPLATE template0;
