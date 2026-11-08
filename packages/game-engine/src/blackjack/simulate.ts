import { createHmacRng, type Rng } from '../rng';
import { applyAction, init } from './engine';
import { basicStrategy } from './strategy';
import type { BlackjackAction, BlackjackState } from './types';

/**
 * Records the Rng results of a round so the engine's "fresh Rng + fast-forward" resumption does
 * not recompute HMACs on every action. Results are identical to using a fresh Rng each time.
 */
class RecordingRng implements Rng {
  private readonly log: number[] = [];
  private index = 0;

  constructor(private readonly inner: Rng) {}

  rewind(): this {
    this.index = 0;
    return this;
  }

  nextInt(max: number): number {
    if (this.index < this.log.length) return this.log[this.index++] as number;
    const value = this.inner.nextInt(max);
    this.log.push(value);
    this.index++;
    return value;
  }

  nextFloat(): number {
    throw new Error('not used by blackjack');
  }
}

export interface SimulationOptions {
  rounds: number;
  /** serverSeed used for every round; round i uses nonce i. */
  seed: string;
  bet?: bigint;
  strategy?: (state: BlackjackState) => BlackjackAction;
  /** Called after each settled round (tests use it to check invariants). */
  onRound?: (state: BlackjackState, nonce: number) => void;
}

export interface SimulationResult {
  rounds: number;
  totalInitialBet: bigint;
  totalBet: bigint;
  totalPayout: bigint;
  /** Player's net result per unit of initial bet (negative = house wins). */
  playerReturn: number;
  /** −playerReturn. */
  houseEdge: number;
  /** Standard error of the per-round result, in units of initial bet. */
  standardError: number;
  outcomes: { blackjacks: number; splits: number; doubles: number; insuranceOffered: number };
}

export function simulateBlackjack(options: SimulationOptions): SimulationResult {
  const bet = options.bet ?? 2n;
  const strategy = options.strategy ?? basicStrategy;
  const unit = Number(bet);
  let totalBet = 0n;
  let totalPayout = 0n;
  let sum = 0;
  let sumSquares = 0;
  const outcomes = { blackjacks: 0, splits: 0, doubles: 0, insuranceOffered: 0 };

  for (let nonce = 0; nonce < options.rounds; nonce++) {
    const rng = new RecordingRng(
      createHmacRng({ serverSeed: options.seed, clientSeed: 'simulation', nonce }),
    );
    let { state } = init({ bet }, rng);
    if (state.insurance.offered) outcomes.insuranceOffered++;
    while (state.phase !== 'SETTLED') {
      const action = strategy(state);
      if (action.type === 'SPLIT') outcomes.splits++;
      if (action.type === 'DOUBLE') outcomes.doubles++;
      state = applyAction(state, action, rng.rewind()).state;
    }
    if (state.hands.some((h) => h.result === 'BLACKJACK')) outcomes.blackjacks++;

    const payout = state.payout as bigint;
    totalBet += state.totalBet;
    totalPayout += payout;
    const x = Number(payout - state.totalBet) / unit;
    sum += x;
    sumSquares += x * x;
    options.onRound?.(state, nonce);
  }

  const n = options.rounds;
  const mean = sum / n;
  const variance = n > 1 ? (sumSquares - n * mean * mean) / (n - 1) : 0;
  return {
    rounds: n,
    totalInitialBet: bet * BigInt(n),
    totalBet,
    totalPayout,
    playerReturn: mean,
    houseEdge: -mean,
    standardError: Math.sqrt(variance / n),
    outcomes,
  };
}
