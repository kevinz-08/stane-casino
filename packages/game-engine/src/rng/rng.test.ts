import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Rng } from './index';

/** Test double: deterministic Rng cycling through a fixed list of floats in [0, 1). */
function sequenceRng(values: readonly number[]): Rng {
  let i = 0;
  const nextFloat = () => values[i++ % values.length] ?? 0;
  return { nextFloat, nextInt: (max) => Math.floor(nextFloat() * max) };
}

describe('Rng contract (example test double)', () => {
  it('is deterministic for the same sequence', () => {
    const a = sequenceRng([0.1, 0.5, 0.9]);
    const b = sequenceRng([0.1, 0.5, 0.9]);
    expect([a.nextInt(52), a.nextInt(52), a.nextInt(52)]).toEqual([
      b.nextInt(52),
      b.nextInt(52),
      b.nextInt(52),
    ]);
  });

  it('property: nextInt stays within [0, max)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), { minLength: 1 }),
        fc.integer({ min: 1, max: 1000 }),
        (values, max) => {
          const n = sequenceRng(values).nextInt(max);
          return Number.isInteger(n) && n >= 0 && n < max;
        },
      ),
    );
  });
});
