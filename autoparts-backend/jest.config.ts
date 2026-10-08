import type { Config } from 'jest';

// Les tests d'intégration exigent PostgreSQL + Redis réels : ils sont
// exclus par défaut et activés via RUN_INTEGRATION=1.
const runIntegration = process.env.RUN_INTEGRATION === '1';

const config: Config = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  rootDir:         '.',
  setupFiles:      ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/src/__tests__/**/*.test.ts',
  ],
  testPathIgnorePatterns: runIntegration ? [] : [
    '<rootDir>/tests/all\\.test\\.ts',
    '<rootDir>/tests/org-type-rules\\.test\\.ts',
    '<rootDir>/src/__tests__/integration/',
  ],
  moduleNameMapper: {
    '^@modules/(.*)$':  '<rootDir>/src/modules/$1',
    '^@entities/(.*)$': '<rootDir>/src/entities/$1',
    '^@shared/(.*)$':   '<rootDir>/src/shared/$1',
    '^@config/(.*)$':   '<rootDir>/src/config/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/database/seed.ts'],
  coverageDirectory:   'coverage',
  coverageThreshold: {
    global: { branches: 50, functions: 60, lines: 60, statements: 60 },
  },
  testTimeout: 30_000,
  verbose:     true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};

export default config;
