jest.mock('../../config/env', () => ({ env: { NODE_ENV: 'test', JWT_ACCESS_SECRET: 'test-32chars-access', JWT_REFRESH_SECRET: 'test-32chars-refresh', DATABASE_URL: 'postgresql://test', REDIS_URL: 'redis://localhost', API_VERSION: 'v1', ALLOWED_ORIGINS: 'http://localhost:3000', APP_URL: 'http://localhost:3000', PORT: '3000', JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '30d' } }));
import { safeOrderBy, escapeLike, safePositiveInt, sanitizeUser, sanitizeDeep, generateRef } from '../../shared/utils/helpers';
describe('safeOrderBy', () => {
  const A = ['name','basePrice','createdAt'] as const;
  it('whitelist ok', () => { expect(safeOrderBy('name',A,'createdAt')).toBe('name'); });
  it('injection rejetée', () => { expect(safeOrderBy("';DROP TABLE--",A,'createdAt')).toBe('createdAt'); });
});
describe('escapeLike', () => {
  it('échappe %', () => { expect(escapeLike('50%')).toBe('50\\%'); });
  it('échappe _', () => { expect(escapeLike('fil_tre')).toBe('fil\\_tre'); });
});
describe('safePositiveInt', () => {
  it('entier positif', () => { expect(safePositiveInt(5)).toBe(5); });
  it('fallback négatif', () => { expect(safePositiveInt(-1)).toBe(1); });
});
describe('sanitizeUser', () => {
  it('retire passwordHash', () => { const r=sanitizeUser({id:'1',email:'a@b.cm',passwordHash:'X'}); expect(r).not.toHaveProperty('passwordHash'); });
});
describe('sanitizeDeep', () => {
  it('retire passwordHash imbriqué', () => { const r=sanitizeDeep({buyer:{id:'1',passwordHash:'X',email:'a@b.cm'}}) as any; expect(r.buyer).not.toHaveProperty('passwordHash'); expect(r.buyer.email).toBe('a@b.cm'); });
});
describe('generateRef', () => {
  it('préfixe correct', () => { expect(generateRef('ORD')).toMatch(/^ORD-/); });
});
