import { AppDataSource } from '../src/data-source';
(async () => {
  await AppDataSource.initialize();
  const cols = await AppDataSource.query("SELECT table_name, column_name FROM information_schema.columns WHERE column_name ~ '[A-Z]' AND table_schema='public' ORDER BY table_name");
  cols.forEach((c: any) => console.log('CAMEL:', c.table_name + '.' + c.column_name));
  await AppDataSource.destroy();
})().catch((e: any) => { console.error('ERR', e.message); process.exit(1); });
