import { describe, expect, it } from 'vitest';
import { BLACKJACK_REFERENCE_HOUSE_EDGE_V1 } from './rules';
import { simulateBlackjack } from './simulate';

/**
 * Roadmap phase 2: the simulated house edge with basic strategy must be within ±0.3 % of the
 * theoretical value for the chosen rules. 2M rounds → standard error ≈ 0.08 %.
 * Slow (~45 s): run with `pnpm --filter @casino/game-engine test:slow` (CI runs it).
 */
describe('house edge (bj-v1, basic strategy)', () => {
  it('2,000,000 simulated rounds land within ±0.3 % of the reference house edge', () => {
    const result = simulateBlackjack({ rounds: 2_000_000, seed: 'house-edge-v1' });
    console.log(
      `house edge ${(result.houseEdge * 100).toFixed(3)} % ± ${(result.standardError * 100).toFixed(3)} % ` +
        `(reference ${(BLACKJACK_REFERENCE_HOUSE_EDGE_V1 * 100).toFixed(2)} %)`,
    );
    expect(Math.abs(result.houseEdge - BLACKJACK_REFERENCE_HOUSE_EDGE_V1)).toBeLessThan(0.003);
    // The measurement must be precise enough for that tolerance to mean something.
    expect(result.standardError).toBeLessThan(0.001);
    // Chip conservation over the whole run.
    expect(result.totalBet).toBeGreaterThanOrEqual(result.totalInitialBet);
  }, 300_000);
});
