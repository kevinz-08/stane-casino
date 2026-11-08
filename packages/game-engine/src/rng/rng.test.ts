import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import vectors from '../../test-vectors/fairness-v1.json';
import { canonicalShoe } from '../blackjack/cards';
import { toHex } from '../crypto';
import { hmacSha256, utf8 } from '../crypto/sha256';
import { commitServerSeed, verifyCommitment } from '../fairness';
import { createHmacRng, LazyShuffle, shuffle } from './index';

/**
 * The vectors were produced by scripts/verify-fairness.mjs with node:crypto, an implementation
 * that shares no code with the engine. CI re-checks them with the same script.
 */
describe('HMAC-SHA256 stream matches the independent node:crypto vectors', () => {
  for (const c of vectors.cases) {
    describe(`serverSeed=${c.serverSeed.slice(0, 16)}… nonce=${c.nonce}`, () => {
      it('commitment', () => {
        expect(commitServerSeed(c.serverSeed)).toBe(c.serverSeedHash);
        expect(verifyCommitment(c.serverSeed, c.serverSeedHash.toUpperCase())).toBe(true);
        expect(verifyCommitment(`${c.serverSeed}x`, c.serverSeedHash)).toBe(false);
      });

      it('raw HMAC blocks', () => {
        c.blocks.forEach((block, cursor) => {
          const msg = utf8(`${c.clientSeed}:${c.nonce}:${cursor}`);
          expect(toHex(hmacSha256(utf8(c.serverSeed), msg))).toBe(block);
        });
      });

      it('uint32 stream', () => {
        const rng = createHmacRng(c);
        expect(Array.from({ length: c.uint32.length }, () => rng.nextUint32())).toEqual(c.uint32);
      });

      it('unbiased integers', () => {
        for (const { max, values } of c.ints) {
          const rng = createHmacRng(c);
          expect(values.map(() => rng.nextInt(max))).toEqual(values);
        }
      });

      it('shuffles (full single deck, lazy six-deck prefix)', () => {
        expect(shuffle(canonicalShoe(1), createHmacRng(c))).toEqual(c.singleDeck);
        const shoe = new LazyShuffle(canonicalShoe(6), createHmacRng(c));
        expect(c.sixDeckFirst40.map(() => shoe.draw())).toEqual(c.sixDeckFirst40);
      });
    });
  }
});

describe('HmacRng', () => {
  it('is deterministic per (serverSeed, clientSeed, nonce) and changes with each', () => {
    const draw = (s: string, c: string, n: number) => {
      const rng = createHmacRng({ serverSeed: s, clientSeed: c, nonce: n });
      return Array.from({ length: 8 }, () => rng.nextInt(1000));
    };
    expect(draw('s', 'c', 1)).toEqual(draw('s', 'c', 1));
    expect(draw('s', 'c', 1)).not.toEqual(draw('s', 'c', 2));
    expect(draw('s', 'c', 1)).not.toEqual(draw('s', 'd', 1));
    expect(draw('s', 'c', 1)).not.toEqual(draw('t', 'c', 1));
  });

  it('property: nextInt stays in [0, max) and nextFloat in [0, 1)', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat(),
        fc.integer({ min: 1, max: 2 ** 32 }),
        (seed, nonce, max) => {
          const rng = createHmacRng({ serverSeed: seed, clientSeed: 'c', nonce });
          const n = rng.nextInt(max);
          const f = rng.nextFloat();
          return Number.isInteger(n) && n >= 0 && n < max && f >= 0 && f < 1;
        },
      ),
    );
  });

  it('rejects invalid arguments', () => {
    const rng = createHmacRng({ serverSeed: 's', clientSeed: 'c', nonce: 0 });
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
    expect(() => rng.nextInt(2 ** 32 + 1)).toThrow(RangeError);
    expect(() => createHmacRng({ serverSeed: 's', clientSeed: 'c', nonce: -1 })).toThrow();
  });

  it('pulls a new HMAC block every 32 bytes', () => {
    const rng = createHmacRng({ serverSeed: 's', clientSeed: 'c', nonce: 0 });
    for (let i = 0; i < 8; i++) rng.nextUint32();
    expect(rng.blocksUsed).toBe(1);
    rng.nextUint32();
    expect(rng.blocksUsed).toBe(2);
  });
});

describe('Fisher–Yates', () => {
  it('property: a shuffle is a permutation, and lazy draws equal the full shuffle', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), fc.integer({ min: 1, max: 60 }), (seed, nonce, size) => {
        const items = Array.from({ length: size }, (_, i) => i);
        const params = { serverSeed: seed, clientSeed: 'x', nonce };
        const full = shuffle(items, createHmacRng(params));
        const lazy = new LazyShuffle(items, createHmacRng(params));
        const drawn = items.map(() => lazy.draw());
        expect([...full].sort((a, b) => a - b)).toEqual(items);
        expect(drawn).toEqual(full);
        expect(lazy.remaining).toBe(0);
        expect(() => lazy.draw()).toThrow(RangeError);
      }),
      { numRuns: 200 },
    );
  });

  it('skip(k) then draw equals drawing k+1 cards', () => {
    const params = { serverSeed: 'a', clientSeed: 'b', nonce: 3 };
    const a = new LazyShuffle(canonicalShoe(6), createHmacRng(params));
    const seq = Array.from({ length: 10 }, () => a.draw());
    const b = new LazyShuffle(canonicalShoe(6), createHmacRng(params));
    b.skip(7);
    expect(b.drawn).toBe(7);
    expect(b.draw()).toBe(seq[7]);
  });
});
