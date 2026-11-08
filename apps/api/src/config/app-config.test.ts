import { describe, expect, it } from 'vitest';
import { loadConfig } from './app-config';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  SERVER_SEED_ENCRYPTION_KEY: 'ab'.repeat(32),
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(base);
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(4000);
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.cookieSecure).toBe(false);
    expect(config.auth.cookieSameSite).toBe('lax');
    expect(config.webOrigins).toEqual(['http://localhost:3000']);
  });

  it('secures cookies by default in production', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).auth.cookieSecure).toBe(true);
  });

  it('parses lists, integers and booleans', () => {
    const config = loadConfig({
      ...base,
      WEB_ORIGIN: 'http://a.test, http://b.test',
      API_PORT: '8080',
      LOG_PRETTY: 'no',
    });
    expect(config.webOrigins).toEqual(['http://a.test', 'http://b.test']);
    expect(config.port).toBe(8080);
    expect(config.log.pretty).toBe(false);
  });

  it('reports every problem at once', () => {
    let message = '';
    try {
      loadConfig({
        JWT_ACCESS_SECRET: 'short',
        API_PORT: 'abc',
        LOG_PRETTY: 'maybe',
        NODE_ENV: 'staging',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const problem of [
      'NODE_ENV must be one of',
      'JWT_ACCESS_SECRET must be at least 32',
      'DATABASE_URL is required',
      'API_PORT must be an integer',
      'LOG_PRETTY must be a boolean',
    ]) {
      expect(message).toContain(problem);
    }
  });

  it('refuses SameSite=None without Secure', () => {
    expect(() => loadConfig({ ...base, REFRESH_COOKIE_SAMESITE: 'none' })).toThrow(
      /requires REFRESH_COOKIE_SECURE=true/,
    );
    expect(
      loadConfig({ ...base, REFRESH_COOKIE_SAMESITE: 'none', REFRESH_COOKIE_SECURE: 'true' }).auth
        .cookieSameSite,
    ).toBe('none');
  });
});
