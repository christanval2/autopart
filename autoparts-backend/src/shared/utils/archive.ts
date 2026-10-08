// ═══════════════════════════════════════════════════════════════
//  ARCHIVE — conformité légale camerounaise : commandes conservées 10 ans (F1c)
//  Export JSON annuel des commandes clôturées vers archives/ + manifeste
//  signé (SHA-256). Copie de conformité : rien n'est supprimé de la base.
// ═══════════════════════════════════════════════════════════════

import { promises as fs } from 'fs';
import * as path          from 'path';
import * as crypto        from 'crypto';
import { AppDataSource }  from '../../config/database';

export interface ArchiveManifest {
  file: string;
  year: number;
  orderCount: number;
  sha256: string;
  generatedAt: string;
}

const ARCHIVE_DIR = path.resolve('archives');

/**
 * Génère l'archive annuelle d'une année donnée (convention : on archive
 * l'année N-3, soit les commandes vieilles d'au moins 3 ans).
 */
export async function generateAnnualArchive(year: number): Promise<ArchiveManifest> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end   = new Date(Date.UTC(year + 1, 0, 1));

  const orders = await AppDataSource.getRepository('Order')
    .createQueryBuilder('o')
    .leftJoinAndSelect('o.lines', 'l')
    .leftJoinAndSelect('o.payment', 'p')
    .leftJoinAndSelect('o.shipments', 's')
    .where('o.orderedAt >= :start AND o.orderedAt < :end', { start, end })
    .andWhere("o.status IN ('delivered','refunded','cancelled')")
    .getMany();

  const payload = JSON.stringify({
    archiveYear: year,
    generatedAt: new Date().toISOString(),
    legalNote: 'Archivage légal 10 ans — Code général des impôts / usages BEAC. Copie de conformité.',
    orders,
  }, null, 2);

  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  const fileName = `orders-${year}.json`;
  await fs.writeFile(path.join(ARCHIVE_DIR, fileName), payload, 'utf-8');

  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');

  // Manifeste cumulatif
  const manifestPath = path.join(ARCHIVE_DIR, 'manifest.json');
  let manifest: ArchiveManifest[] = [];
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  } catch { /* première archive */ }
  manifest = manifest.filter(m => m.year !== year); // re-génération = remplacement
  manifest.push({ file: fileName, year, orderCount: orders.length, sha256, generatedAt: new Date().toISOString() });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return { file: fileName, year, orderCount: orders.length, sha256, generatedAt: new Date().toISOString() };
}

export async function readManifest(): Promise<ArchiveManifest[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(ARCHIVE_DIR, 'manifest.json'), 'utf-8'));
  } catch {
    return [];
  }
}
