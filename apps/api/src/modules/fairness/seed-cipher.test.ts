import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SeedCipher } from './seed-cipher';

describe('SeedCipher (AES-256-GCM)', () => {
  const cipher = new SeedCipher(randomBytes(32));
  const seed = randomBytes(32).toString('hex');

  it('round-trips and never stores the plaintext', () => {
    const stored = cipher.encrypt(seed, 'sp_1');
    expect(stored).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain(seed);
    expect(cipher.decrypt(stored, 'sp_1')).toBe(seed);
  });

  it('uses a fresh IV every time', () => {
    expect(cipher.encrypt(seed, 'sp_1')).not.toBe(cipher.encrypt(seed, 'sp_1'));
  });

  it('refuses a ciphertext moved to another seed pair, a tampered one, or a wrong key', () => {
    const stored = cipher.encrypt(seed, 'sp_1');
    expect(() => cipher.decrypt(stored, 'sp_2')).toThrow();
    const [v, iv, tag, data] = stored.split(':') as [string, string, string, string];
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] = (flipped[0] as number) ^ 1;
    expect(() =>
      cipher.decrypt([v, iv, tag, flipped.toString('base64url')].join(':'), 'sp_1'),
    ).toThrow();
    expect(() => new SeedCipher(randomBytes(32)).decrypt(stored, 'sp_1')).toThrow();
    expect(() => cipher.decrypt('plaintext-seed', 'sp_1')).toThrow(/format/);
    expect(() => new SeedCipher(randomBytes(16))).toThrow(/32 bytes/);
  });
});
