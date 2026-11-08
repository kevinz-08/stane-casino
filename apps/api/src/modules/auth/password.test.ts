import { describe, expect, it } from 'vitest';
import { getDummyHash, hashPassword, verifyPassword } from './password';

const FAST = 10; // log2(N): keep unit tests quick; production uses 15

describe('password hashing (scrypt)', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('s3cret-passphrase', FAST);
    expect(hash).toMatch(/^scrypt\$10\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword('s3cret-passphrase', hash)).toBe(true);
    expect(await verifyPassword('s3cret-passphrasE', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same', FAST), hashPassword('same', FAST)]);
    expect(a).not.toBe(b);
  });

  it('keeps verifying hashes made with other cost parameters', async () => {
    const hash = await hashPassword('pw', 11);
    expect(await verifyPassword('pw', hash)).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('pw', '')).toBe(false);
    expect(await verifyPassword('pw', 'bcrypt$whatever')).toBe(false);
  });

  it('provides a stable dummy hash for unknown users', async () => {
    const dummy = await getDummyHash(FAST);
    expect(await getDummyHash(FAST)).toBe(dummy);
    expect(await verifyPassword('anything', dummy)).toBe(false);
  });
});
