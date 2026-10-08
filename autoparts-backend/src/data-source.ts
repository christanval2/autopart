import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { baseOptions } from './config/database';

// DataSource dédiée à la CLI TypeORM (migration:generate/run/revert, schema:log)
// et au seed. Hérite de la configuration de src/config/database.ts (mêmes
// entités, mêmes migrations) — une seule source de vérité pour la config.
export const AppDataSource = new DataSource({
  ...baseOptions,
  synchronize: false,
  migrationsRun: false,
});
