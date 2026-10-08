process.env.NODE_ENV           = 'test';
process.env.JWT_ACCESS_SECRET  = 'test-access-secret-minimum-32-chars-ok';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-ok';
process.env.JWT_ACCESS_TTL     = '15m';
process.env.JWT_REFRESH_TTL    = '30d';
process.env.API_VERSION        = 'v1';
process.env.ALLOWED_ORIGINS    = 'http://localhost:3000';
process.env.APP_URL            = 'http://localhost:3000';
process.env.PORT               = '3000';
process.env.ENCRYPTION_KEY     = '01234567890123456789012345678901'; // exactement 32 chars
process.env.LOG_LEVEL          = 'error';

if (process.env.RUN_INTEGRATION === '1') {
  // Tests d'intégration : vraie base Postgres + Redis (docker-compose),
  // valeurs du .env du projet. Migrées + seedées via `npm run db:setup`.
  require('dotenv').config({ override: false });
} else {
  // Tests unitaires : environnement hermétique, aucune connexion réelle.
  process.env.DATABASE_URL      = 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL         = 'redis://localhost:6379';
}
jest.spyOn(console,'log').mockImplementation(()=>{});
jest.spyOn(console,'warn').mockImplementation(()=>{});
jest.spyOn(console,'error').mockImplementation(()=>{});
