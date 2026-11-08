import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { E2E_DATABASE_URL } from '../playwright.config';

/** Applies pending migrations to the e2e database (non-destructive; creates it if needed). */
export default function setup(): void {
  if (!new URL(E2E_DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error('Refusing to run e2e tests against a database not ending in _test');
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '../../api'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });
}
