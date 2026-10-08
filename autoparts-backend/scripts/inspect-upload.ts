import { AppDataSource } from '../src/data-source';
import { UploadsService } from '../src/modules/uploads';
(async () => {
  await AppDataSource.initialize();
  // PNG 1x1 minimal valide
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  try {
    const img = await UploadsService.uploadProductImage('a7c36c91-d984-42b1-8ca1-7e739fb59945', png, 'test.png', false, 'image/png');
    console.log('UPLOAD OK:', img.id, img.url);
  } catch (e: any) {
    console.log('ERREUR:', e.message);
    console.log('STACK:', (e.stack ?? '').split('\n').slice(0, 8).join('\n'));
  }
  await AppDataSource.destroy();
  process.exit(0);
})().catch(e => { console.error('INIT-ERR', e.message); process.exit(1); });
