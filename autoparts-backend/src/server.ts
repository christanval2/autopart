import 'reflect-metadata';
import http                        from 'http';
import { initDatabase, AppDataSource } from './config/database';
import { redis }                   from './config/redis';
import { env }                     from './config/env';
import { logger }                  from './shared/utils/logger';
import app                         from './app';
import { initWebSocket }           from './modules/notifications';

// Démarrer les workers BullMQ en dernier (après DB)
import './jobs';

async function bootstrap(): Promise<void> {
  logger.info('🚀 Démarrage AutoParts API...');

  // 1. Base de données
  await initDatabase();

   // 2. Redis
   if (redis.status !== 'ready' && redis.status !== 'connect') await redis.connect();
  logger.info('✅ Redis connecté');

  // 3. Serveur HTTP
  const server = http.createServer(app);

  // 4. WebSocket Socket.io
  initWebSocket(server);
  logger.info('✅ WebSocket initialisé');

  // 5. Écouter
  server.listen(env.PORT, () => {
    logger.info(`✅ Serveur démarré — http://localhost:${env.PORT}`);
    logger.info(`📡 API      — http://localhost:${env.PORT}/api/${env.API_VERSION}`);
    logger.info(`❤️  Health   — http://localhost:${env.PORT}/health`);
    logger.info(`🌍 Env      — ${env.NODE_ENV}`);
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} reçu — arrêt en cours...`);
    server.close(async () => {
      try {
        await redis.quit();
        await AppDataSource.destroy();
        logger.info('✅ Arrêt propre');
        process.exit(0);
      } catch (err) {
        logger.error('Erreur lors de l\'arrêt:', err);
        process.exit(1);
      }
    });
    // Forcer après 15s
    setTimeout(() => {
      logger.warn('⚠️  Arrêt forcé (timeout 15s)');
      process.exit(1);
    }, 15_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection:', reason);
    if (env.NODE_ENV === 'production') shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException:', err);
    shutdown('uncaughtException');
  });
}

bootstrap().catch((err) => {
  console.error('❌ Erreur fatale au démarrage:', err);
  process.exit(1);
});
