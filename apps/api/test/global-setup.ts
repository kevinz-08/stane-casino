import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { integrationEnv } from './test-env';

/**
 * Brings the test database up to date with the migrations (creating it if needed).
 * Non-destructive on purpose: every test creates its own users and accounts, so data from
 * previous runs does not interfere and nothing has to be wiped. If a migration is edited
 * during development, recreate the test database by hand (`docker compose down -v` or a
 * `prisma migrate reset` against TEST_DATABASE_URL).
 */
export default function setup(): void {
  const env = integrationEnv();
  const { host, pathname } = new URL(env.DATABASE_URL as string);
  if (!pathname.endsWith('_test')) {
    throw new Error(`Refusing to use a database whose name does not end in _test (${pathname})`);
  }
  console.log(`[integration] migrating ${host}${pathname}`);
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
}
