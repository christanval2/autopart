import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import { env } from './env';

// Chemins résolus depuis le CWD — en production le code vit dans dist/
// (tsc outDir) : entités et migrations y sont chargées en JS.
const isProd = process.env.NODE_ENV === 'production';
const ENTITIES = isProd
  ? [path.resolve('dist', 'src', 'entities', '**', '*.js')]
  : [path.resolve('src', 'entities', '**', '*.{ts,js}')];
const MIGRATIONS = isProd
  ? [path.resolve('dist', 'migrations', '**', '*.js')]
  : [path.resolve('migrations', '**', '*.{ts,js}')];

const baseOptions: DataSourceOptions = {
  type:      'postgres',
  url:       env.DATABASE_URL,
  entities:  ENTITIES,
  migrations:MIGRATIONS,
  logging:   env.DB_LOGGING ? ['query', 'error'] : ['error'],
  // SSL requis par les Postgres managés (Neon, Render, Supabase) ; les
  // URLs locales n'en ont pas. rejectUnauthorized off : les offres
  // gratuites utilisent des certificats non rootés dans Node.
  ssl: env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
  extra: {
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis:  5_000,
  },
};

export { baseOptions };

// synchronize désactivé PARTOUT : toute évolution du schéma passe par
// une migration générée (npm run migration:generate), jamais par la
// synchro automatique des entités — sinon drift entités/migrations.
const envOptions: Partial<DataSourceOptions> =
  env.NODE_ENV === 'production'
    ? { synchronize: false, migrationsRun: true }
    : { synchronize: false, migrationsRun: false };

export const AppDataSource = new DataSource({
  ...baseOptions,
  ...envOptions,
} as DataSourceOptions);

export const initDatabase = async (): Promise<void> => {
  if (AppDataSource.isInitialized) return;
  await AppDataSource.initialize();
  console.info(`✅ PostgreSQL connecté [pool: ${env.DB_POOL_MIN}–${env.DB_POOL_MAX}]`);
};