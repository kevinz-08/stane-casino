import { hmacSha256, utf8 } from '../crypto';

/**
 * Source of randomness consumed by games. The ONLY allowed randomness inside the engine.
 */
export interface Rng {
  /** Uniform float in [0, 1) (32 bits of resolution). */
  nextFloat(): number;
  /** Uniform integer in [0, maxExclusive) with no modulo bias. `maxExclusive` in [1, 2^32]. */
  nextInt(maxExclusive: number): number;
}

export interface HmacRngParams {
  readonly serverSeed: string;
  readonly clientSeed: string;
  readonly nonce: number;
}

const TWO_32 = 0x100000000;

/**
 * Provably fair byte stream (ADR-003):
 *
 *   block(cursor) = HMAC_SHA256(key = utf8(serverSeed), msg = utf8(`${clientSeed}:${nonce}:${cursor}`))
 *
 * for cursor = 0, 1, 2, ... Bytes are consumed in order; a uint32 is 4 consecutive bytes read
 * big-endian. `nextInt(n)` draws uint32s and rejects those >= floor(2^32 / n) * n, so every
 * result in [0, n) is equally likely. Changing ANY of this changes every past round: version it.
 */
export class HmacRng implements Rng {
  private readonly key: Uint8Array;
  private block: Uint8Array = new Uint8Array(0);
  private offset = 0;
  private cursor = 0;

  constructor(private readonly params: HmacRngParams) {
    if (!Number.isSafeInteger(params.nonce) || params.nonce < 0) {
      throw new RangeError('nonce must be a non-negative safe integer');
    }
    this.key = utf8(params.serverSeed);
  }

  /** Number of HMAC blocks generated so far (for diagnostics and tests). */
  get blocksUsed(): number {
    return this.cursor;
  }

  nextByte(): number {
    if (this.offset >= this.block.length) {
      const message = `${this.params.clientSeed}:${this.params.nonce}:${this.cursor}`;
      this.block = hmacSha256(this.key, utf8(message));
      this.cursor++;
      this.offset = 0;
    }
    return this.block[this.offset++] as number;
  }

  nextUint32(): number {
    return (
      ((this.nextByte() << 24) |
        (this.nextByte() << 16) |
        (this.nextByte() << 8) |
        this.nextByte()) >>>
      0
    );
  }

  nextFloat(): number {
    return this.nextUint32() / TWO_32;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_32) {
      throw new RangeError('maxExclusive must be an integer in [1, 2^32]');
    }
    const limit = Math.floor(TWO_32 / maxExclusive) * maxExclusive;
    for (;;) {
      const x = this.nextUint32();
      if (x < limit) return x % maxExclusive;
    }
  }
}

export function createHmacRng(params: HmacRngParams): HmacRng {
  return new HmacRng(params);
}

/**
 * Forward Fisher–Yates, computed lazily: `draw()` returns the card at the next position.
 *
 *   for i = 0 .. n-2:  j = i + rng.nextInt(n - i);  swap(items[i], items[j])
 *
 * After step i, position i is final, so dealing k cards only costs k steps, and the full order
 * (`order()`) is exactly what a complete up-front shuffle would produce.
 */
export class LazyShuffle<T> {
  private readonly items: T[];
  private position = 0;

  constructor(
    items: readonly T[],
    private readonly rng: Rng,
  ) {
    this.items = [...items];
  }

  get drawn(): number {
    return this.position;
  }

  get remaining(): number {
    return this.items.length - this.position;
  }

  draw(): T {
    const i = this.position;
    const n = this.items.length;
    if (i >= n) throw new RangeError('no items left to draw');
    if (i < n - 1) {
      const j = i + this.rng.nextInt(n - i);
      const tmp = this.items[i] as T;
      this.items[i] = this.items[j] as T;
      this.items[j] = tmp;
    }
    this.position++;
    return this.items[i] as T;
  }

  /** Advances without returning anything (resuming a round). */
  skip(count: number): void {
    for (let k = 0; k < count; k++) this.draw();
  }

  /** Completes the shuffle and returns the whole order. Consumes the rest of the stream. */
  order(): T[] {
    while (this.position < this.items.length) this.draw();
    return [...this.items];
  }
}

/** Full Fisher–Yates shuffle (same order as `LazyShuffle#order`). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  return new LazyShuffle(items, rng).order();
}
