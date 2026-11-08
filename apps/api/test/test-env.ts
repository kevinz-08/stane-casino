import { resolve } from 'node:path';
import { loadDotEnv } from '../src/config/env-file';

/**
 * Environment of the integration suite. It never touches the development database: it uses
 * TEST_DATABASE_URL or, by default, DATABASE_URL with the database name suffixed by `_test`.
 */
export function integrationEnv(): Record<string, string> {
  loadDotEnv(resolve(__dirname, '..'));
  const databaseUrl = process.env.TEST_DATABASE_URL ?? deriveTestUrl(process.env.DATABASE_URL);

  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'integration-tests-secret-not-for-production-use',
    SERVER_SEED_ENCRYPTION_KEY: '11'.repeat(32),
    LOG_LEVEL: 'silent',
    LOG_PRETTY: 'false',
    // Cheap hashing and no rate limiting by default; specific tests override these.
    PASSWORD_HASH_LOG_N: '10',
    RATE_LIMIT_MAX: '1000000',
    RATE_LIMIT_AUTH_MAX: '1000000',
    REFRESH_REUSE_GRACE_SECONDS: '0',
    REFRESH_COOKIE_SECURE: 'false',
  };
}

function deriveTestUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run the integration tests');
  }
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '') || 'casino';
  parsed.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return parsed.toString();
}
