import { AppDataSource } from '../src/data-source';
import { Payment } from '../src/entities/Payment';
(async () => {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.getRepository(Payment)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.order', 'o')
      .orderBy('p.paid_at', 'DESC', 'NULLS LAST')
      .addOrderBy('p.createdAt', 'DESC')
      .limit(3)
      .getMany();
    console.log('OK:', rows.length);
  } catch (e: any) {
    console.log('ERREUR:', e.message);
    console.log('STACK:', (e.stack ?? '').split('\n').slice(0, 6).join('\n'));
  }
  await AppDataSource.destroy();
  process.exit(0);
})().catch(e => { console.error('INIT-ERR', e.message); process.exit(1); });
