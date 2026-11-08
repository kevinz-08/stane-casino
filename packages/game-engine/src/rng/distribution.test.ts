import { describe, expect, it } from 'vitest';
import { canonicalShoe } from '../blackjack/cards';
import { createHmacRng, LazyShuffle } from './index';

/**
 * Upper-tail p-value of the chi-square distribution (Wilson–Hilferty approximation, accurate
 * to ~1e-3 for the degrees of freedom used here, which is plenty for a 0.001 threshold).
 */
function chiSquarePValue(statistic: number, dof: number): number {
  const z = (Math.cbrt(statistic / dof) - (1 - 2 / (9 * dof))) / Math.sqrt(2 / (9 * dof));
  return 0.5 * erfc(z / Math.SQRT2);
}

function erfc(x: number): number {
  // Numerical Recipes erfc, |error| < 1.2e-7.
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y =
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? y : 2 - y;
}

function chiSquare(observed: number[], expectedEach: number): number {
  return observed.reduce((sum, o) => sum + (o - expectedEach) ** 2 / expectedEach, 0);
}

const SIGNIFICANCE = 0.001;

describe('card distribution (deterministic seeds, so the outcome never flakes)', () => {
  it('χ² over 1,000,000+ dealt cards: every card face is equally likely, at every position', () => {
    const ROUNDS = 100_000;
    const POSITIONS = 11; // the first cards of a round: initial deal + hits/dealer draws
    const shoe = canonicalShoe(6);
    const face = new Map(canonicalShoe(1).map((card, i) => [card, i]));
    const overall = new Array<number>(52).fill(0);
    const byPosition = Array.from({ length: POSITIONS }, () => new Array<number>(52).fill(0));

    for (let nonce = 0; nonce < ROUNDS; nonce++) {
      const deal = new LazyShuffle(
        shoe,
        createHmacRng({ serverSeed: 'chi-square', clientSeed: 'cards', nonce }),
      );
      for (let p = 0; p < POSITIONS; p++) {
        const f = face.get(deal.draw()) as number;
        (overall[f] as number)++;
        (byPosition[p] as number[])[f]!++;
      }
    }

    const total = ROUNDS * POSITIONS;
    expect(total).toBeGreaterThanOrEqual(1_000_000);
    const overallStat = chiSquare(overall, total / 52);
    expect(chiSquarePValue(overallStat, 51)).toBeGreaterThan(SIGNIFICANCE);

    for (const counts of byPosition) {
      const p = chiSquarePValue(chiSquare(counts, ROUNDS / 52), 51);
      // 11 tests: Bonferroni-corrected threshold.
      expect(p).toBeGreaterThan(SIGNIFICANCE / POSITIONS);
    }
  });

  it('no modulo bias: nextInt(3·2^30) is uniform (a plain `% max` would double the low third)', () => {
    const max = 3 * 2 ** 30;
    const buckets = new Array<number>(3).fill(0);
    const rng = createHmacRng({ serverSeed: 'modulo-bias', clientSeed: 'x', nonce: 0 });
    const N = 300_000;
    for (let i = 0; i < N; i++) (buckets as number[])[Math.floor(rng.nextInt(max) / 2 ** 30)]!++;

    // With x % max on a uint32, bucket 0 would get ~50 % of draws instead of 33 %.
    for (const b of buckets) expect(Math.abs(b / N - 1 / 3)).toBeLessThan(0.005);
    expect(chiSquarePValue(chiSquare(buckets, N / 3), 2)).toBeGreaterThan(SIGNIFICANCE);
  });

  it('the χ² helper detects an obviously biased sample (sanity check of the test itself)', () => {
    const biased = [1500, 1000, 1000, 1000, 500];
    expect(chiSquarePValue(chiSquare(biased, 1000), 4)).toBeLessThan(SIGNIFICANCE);
    const fair = [1010, 990, 1005, 995, 1000];
    expect(chiSquarePValue(chiSquare(fair, 1000), 4)).toBeGreaterThan(0.5);
  });
});
