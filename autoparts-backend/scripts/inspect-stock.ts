import { AppDataSource } from '../src/data-source';
import { StockLevel } from '../src/entities/StockLevel';
(async () => {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.getRepository(StockLevel)
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.variant', 'v')
      .leftJoinAndSelect('v.product', 'p')
      .leftJoinAndSelect('sl.warehouse', 'w')
      .limit(2)
      .getMany();
    console.log('SANS filtre OK:', rows.length, 'lignes');
  } catch (e: any) { console.log('ERREUR sans filtre:', e.message); }
  try {
    const rows = await AppDataSource.getRepository(StockLevel)
      .createQueryBuilder('sl')
      .innerJoin('sl.warehouse', 'whf', '1=1')
      .leftJoinAndSelect('sl.variant', 'v')
      .leftJoinAndSelect('v.product', 'p')
      .leftJoinAndSelect('sl.warehouse', 'w')
      .limit(2)
      .getMany();
    console.log('AVEC innerJoin 1=1 OK:', rows.length);
  } catch (e: any) { console.log('ERREUR innerJoin 1=1:', e.message); }
  await AppDataSource.destroy();
})().catch(e => { console.error('INIT-ERR', e.message); process.exit(1); });
