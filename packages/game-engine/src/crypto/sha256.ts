/**
 * SHA-256 and HMAC-SHA256 in plain TypeScript (FIPS 180-4, RFC 2104).
 *
 * Why not `node:crypto` / WebCrypto: the engine must run unchanged in Node (server, simulators)
 * and in the browser (the player's round verifier), synchronously, with no platform APIs.
 * Correctness is pinned by NIST/RFC 4231 test vectors and cross-checked against `node:crypto`
 * by an independent script (`scripts/verify-fairness.mjs`).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function compress(state: Uint32Array, block: Uint8Array, offset: number, w: Uint32Array): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    w[i] =
      ((block[j] as number) << 24) |
      ((block[j + 1] as number) << 16) |
      ((block[j + 2] as number) << 8) |
      (block[j + 3] as number);
  }
  for (let i = 16; i < 64; i++) {
    const w15 = w[i - 15] as number;
    const w2 = w[i - 2] as number;
    const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
    const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
    w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0;
  }

  let a = state[0] as number;
  let b = state[1] as number;
  let c = state[2] as number;
  let d = state[3] as number;
  let e = state[4] as number;
  let f = state[5] as number;
  let g = state[6] as number;
  let h = state[7] as number;

  for (let i = 0; i < 64; i++) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + (K[i] as number) + (w[i] as number)) | 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }

  state[0] = ((state[0] as number) + a) | 0;
  state[1] = ((state[1] as number) + b) | 0;
  state[2] = ((state[2] as number) + c) | 0;
  state[3] = ((state[3] as number) + d) | 0;
  state[4] = ((state[4] as number) + e) | 0;
  state[5] = ((state[5] as number) + f) | 0;
  state[6] = ((state[6] as number) + g) | 0;
  state[7] = ((state[7] as number) + h) | 0;
}

export function sha256(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  // Message + 0x80 + zero padding + 64-bit length, rounded up to 64-byte blocks.
  const total = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(total);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(total - 4, bitLength >>> 0);

  const state = new Uint32Array(H0);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < total; offset += 64) compress(state, padded, offset, w);

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, state[i] as number);
  return out;
}

const BLOCK_SIZE = 64;

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const k = new Uint8Array(BLOCK_SIZE);
  k.set(key.length > BLOCK_SIZE ? sha256(key) : key);
  const inner = new Uint8Array(BLOCK_SIZE + message.length);
  const outer = new Uint8Array(BLOCK_SIZE + 32);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    inner[i] = (k[i] as number) ^ 0x36;
    outer[i] = (k[i] as number) ^ 0x5c;
  }
  inner.set(message, BLOCK_SIZE);
  outer.set(sha256(inner), BLOCK_SIZE);
  return sha256(outer);
}

/** UTF-8 encoding without relying on `TextEncoder` (not part of the ES standard library). */
export function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) as number;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
