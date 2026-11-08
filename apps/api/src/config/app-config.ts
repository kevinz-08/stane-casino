/**
 * Typed, validated configuration. Read once from the environment at startup; the app fails fast
 * with a readable message if something required is missing or malformed.
 */
export const APP_CONFIG = Symbol('APP_CONFIG');

export type NodeEnv = 'development' | 'production' | 'test';
export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  /** Allowed CORS origins (comma-separated in `WEB_ORIGIN`). */
  webOrigins: string[];
  auth: {
    jwtAccessSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    /** A refresh token rotated less than this long ago is not treated as stolen (racing tabs). */
    refreshReuseGraceSeconds: number;
    cookieSecure: boolean;
    cookieSameSite: CookieSameSite;
    /** log2(N) for scrypt. 15 in production; tests lower it to keep suites fast. */
    passwordHashLogN: number;
  };
  rateLimit: {
    windowMs: number;
    /** Requests per window per IP, for every route. */
    limit: number;
    /** Requests per window per IP for credential routes (login/register). */
    authLimit: number;
  };
  log: {
    level: string;
    pretty: boolean;
  };
  wallet: {
    /** Max time waiting for a DB connection to start a ledger transaction. */
    txMaxWaitMs: number;
    /** Max duration of a ledger transaction. */
    txTimeoutMs: number;
  };
  fairness: {
    /** 32-byte AES-256-GCM key that encrypts active server seeds at rest. */
    seedEncryptionKey: Buffer;
  };
}

type Env = Record<string, string | undefined>;

class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  const str = (key: string, fallback?: string): string => {
    const value = env[key]?.trim() || fallback;
    if (value === undefined) {
      problems.push(`${key} is required`);
      return '';
    }
    return value;
  };

  const int = (key: string, fallback: number, min = 0): number => {
    const raw = env[key]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) {
      problems.push(`${key} must be an integer >= ${min} (got "${raw}")`);
      return fallback;
    }
    return value;
  };

  const bool = (key: string, fallback: boolean): boolean => {
    const raw = env[key]?.trim().toLowerCase();
    if (!raw) return fallback;
    if (['1', 'true', 'yes'].includes(raw)) return true;
    if (['0', 'false', 'no'].includes(raw)) return false;
    problems.push(`${key} must be a boolean (got "${raw}")`);
    return fallback;
  };

  const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const raw = env[key]?.trim();
    if (!raw) return fallback;
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    problems.push(`${key} must be one of ${allowed.join(', ')} (got "${raw}")`);
    return fallback;
  };

  const nodeEnv = oneOf<NodeEnv>('NODE_ENV', ['development', 'production', 'test'], 'development');
  const isProd = nodeEnv === 'production';

  const jwtAccessSecret = str('JWT_ACCESS_SECRET');
  if (jwtAccessSecret && jwtAccessSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  const cookieSameSite = oneOf<CookieSameSite>(
    'REFRESH_COOKIE_SAMESITE',
    ['lax', 'strict', 'none'],
    'lax',
  );
  const cookieSecure = bool('REFRESH_COOKIE_SECURE', isProd);
  if (cookieSameSite === 'none' && !cookieSecure) {
    problems.push('REFRESH_COOKIE_SAMESITE=none requires REFRESH_COOKIE_SECURE=true');
  }

  const seedKeyRaw = str('SERVER_SEED_ENCRYPTION_KEY');
  const seedEncryptionKey = /^[0-9a-f]{64}$/i.test(seedKeyRaw)
    ? Buffer.from(seedKeyRaw, 'hex')
    : Buffer.from(seedKeyRaw, 'base64');
  if (seedKeyRaw && seedEncryptionKey.length !== 32) {
    problems.push('SERVER_SEED_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
  }

  const config: AppConfig = {
    nodeEnv,
    port: int('API_PORT', 4000, 1),
    databaseUrl: str('DATABASE_URL'),
    webOrigins: str('WEB_ORIGIN', 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    auth: {
      jwtAccessSecret,
      accessTokenTtlSeconds: int('JWT_ACCESS_TTL_SECONDS', 15 * 60, 30),
      refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7, 1),
      refreshReuseGraceSeconds: int('REFRESH_REUSE_GRACE_SECONDS', 10, 0),
      cookieSecure,
      cookieSameSite,
      passwordHashLogN: int('PASSWORD_HASH_LOG_N', 15, 10),
    },
    rateLimit: {
      windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000, 1000),
      limit: int('RATE_LIMIT_MAX', 300, 1),
      authLimit: int('RATE_LIMIT_AUTH_MAX', 10, 1),
    },
    log: {
      level: str('LOG_LEVEL', isProd ? 'info' : 'debug'),
      pretty: bool('LOG_PRETTY', nodeEnv === 'development'),
    },
    wallet: {
      txMaxWaitMs: int('WALLET_TX_MAX_WAIT_MS', 10_000, 100),
      txTimeoutMs: int('WALLET_TX_TIMEOUT_MS', 10_000, 100),
    },
    fairness: { seedEncryptionKey },
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
