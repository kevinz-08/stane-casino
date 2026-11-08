import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/**
 * AES-256-GCM for server seeds at rest (`v1:<iv>:<tag>:<ciphertext>`, base64url parts).
 * GCM authenticates the ciphertext, so a tampered row fails to decrypt instead of yielding a
 * different seed. The seed pair id is bound as additional data: a ciphertext copied to another
 * row does not decrypt either.
 */
export class SeedCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('seed encryption key must be 32 bytes');
  }

  encrypt(plaintext: string, seedPairId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(seedPairId));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join(':');
  }

  decrypt(stored: string, seedPairId: string): string {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) {
      throw new Error('unrecognised encrypted seed format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(seedPairId));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
