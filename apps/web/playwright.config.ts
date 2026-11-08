import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the real API (against the `_test` database) and the production build of
 * the web, driven by a real browser. The web build has the API URL baked in
 * (NEXT_PUBLIC_API_URL, default http://localhost:4000), so these ports are fixed.
 *
 *   pnpm build && pnpm --filter @casino/web test:e2e        (needs `docker compose up`)
 *
 * Locally the installed Google Chrome is used (nothing to download); CI installs Chromium.
 */
const root = resolve(__dirname, '../..');
const fileEnv = existsSync(resolve(root, '.env'))
  ? parseEnv(readFileSync(resolve(root, '.env'), 'utf8'))
  : {};
const baseDb = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!baseDb) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL for the e2e tests');
  const url = new URL(baseDb);
  const name = url.pathname.replace(/^\//, '');
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}

export const E2E_DATABASE_URL = testDatabaseUrl();
/** The web port can move (E2E_WEB_PORT) if a dev server already uses 3000. */
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3000';
const WEB = `http://localhost:${WEB_PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: CI ? undefined : 'chrome' },
      testIgnore: /responsive.spec.ts/,
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        channel: CI ? undefined : 'chrome',
      },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: '4000',
        WEB_ORIGIN: WEB,
        DATABASE_URL: E2E_DATABASE_URL,
        JWT_ACCESS_SECRET: 'e2e-tests-secret-not-for-production-use-at-all',
        SERVER_SEED_ENCRYPTION_KEY: '22'.repeat(32),
        PASSWORD_HASH_LOG_N: '10',
        RATE_LIMIT_MAX: '1000000',
        RATE_LIMIT_AUTH_MAX: '1000000',
        LOG_LEVEL: 'warn',
        LOG_PRETTY: 'false',
      },
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: WEB,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
