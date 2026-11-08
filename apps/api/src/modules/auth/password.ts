import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

/**
 * scrypt (memory-hard, built into Node: no native addon). The parameters are stored with the
 * hash, so the cost can be raised later and old hashes still verify.
 *
 * Format: `scrypt$<log2N>$<r>$<p>$<salt b64url>$<hash b64url>`
 */
export async function hashPassword(password: string, logN = 15): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, options(logN, BLOCK_SIZE, PARALLELISM));
  return [
    'scrypt',
    logN,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, logN, r, p, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(hashB64, 'base64url');
  const key = await scrypt(
    password,
    Buffer.from(saltB64, 'base64url'),
    expected.length,
    options(Number(logN), Number(r), Number(p)),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function options(logN: number, r: number, p: number): ScryptOptions {
  const N = 2 ** logN;
  // scrypt needs ~128 * N * r bytes; leave headroom over Node's 32 MiB default.
  return { N, r, p, maxmem: 128 * N * r * 2 };
}

/**
 * A valid hash of a random password. Verifying against it when the e-mail does not exist keeps
 * login timing the same for known and unknown accounts (no user enumeration by timing).
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(logN: number): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'), logN);
  return dummyHash;
}
