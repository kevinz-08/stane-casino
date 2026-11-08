import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { integrationEnv } from './test/test-env';

/**
 * Unit + integration tests against a real PostgreSQL (docker compose / CI service).
 * The `wallet` module must keep >= 90 % coverage.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.int.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['reflect-metadata'],
    env: integrationEnv(),
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: {
        'src/modules/wallet/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
});
