// ═══════════════════════════════════════════════════════════════
//  SCRIPT ONE-SHOT (F1) — chiffre les téléphones existants.
//  Après `npm run migration:run` (qui ajoute phone_enc/phone_hash) :
//    npx ts-node --transpile-only -r tsconfig-paths/register scripts/encrypt-phones.ts
//  Chiffre chaque users.phone en clair vers phone_enc + phone_hash,
//  puis SUPPRIME l'ancienne colonne phone. Idempotent.
// ═══════════════════════════════════════════════════════════════

import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { encrypt, hashSHA256 } from '../shared/utils/helpers';

async function main() {
  await AppDataSource.initialize();
  const users = await AppDataSource.query(
    `SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone_enc IS NULL`,
  );
  console.log(`🔐 ${users.length} téléphone(s) à chiffrer...`);

  for (const u of users) {
    await AppDataSource.query(
      `UPDATE users SET phone_enc = $1, phone_hash = $2 WHERE id = $3`,
      [encrypt(u.phone), hashSHA256(u.phone), u.id],
    );
  }

  await AppDataSource.query(`ALTER TABLE users DROP COLUMN IF EXISTS phone`);
  console.log('✅ Téléphones chiffrés, colonne "phone" supprimée.');
  await AppDataSource.destroy();
}

main().catch(e => { console.error(e); process.exit(1); });
