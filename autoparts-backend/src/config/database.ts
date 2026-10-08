import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import { env } from './env';

// Chemin absolu explicite pour éviter les problèmes de résolution __dirname sur Windows
const ENTITIES = [
  path.resolve('src', 'entities', '**', '*.{ts,js}'),
];
// Les migrations vivent à la racine du projet (dossier migrations/)
const MIGRATIONS = [
  path.resolve('migrations', '**', '*.{ts,js}'),
];

const baseOptions: DataSourceOptions = {
  type:      'postgres',
  url:       env.DATABASE_URL,
  entities:  ENTITIES,
  migrations:MIGRATIONS,
  logging:   env.DB_LOGGING ? ['query', 'error'] : ['error'],
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