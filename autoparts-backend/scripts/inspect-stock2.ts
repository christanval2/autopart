import { AppDataSource } from '../src/data-source';
import { StockService } from '../src/modules/stock';
import { StockQuerySchema } from '../src/modules/stock';
(async () => {
  await AppDataSource.initialize();
  try {
    const query = StockQuerySchema.parse({ limit: '2' });
    const result = await StockService.getStockLevels(undefined, query);
    console.log('OK:', JSON.stringify(result).slice(0, 100));
  } catch (e: any) {
    console.log('ERREUR:', e.message);
    console.log('STACK:', (e.stack ?? '').split('\n').slice(0, 8).join('\n'));
  }
  await AppDataSource.destroy();
  process.exit(0);
})().catch(e => { console.error('INIT-ERR', e.message, (e.stack ?? '').split('\n').slice(0, 5).join('\n')); process.exit(1); });
