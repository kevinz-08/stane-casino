import type { Rng } from '../rng';
import type { GameId, RoundEvent, RoundState, Settlement } from './types';

export interface StepResult<TState extends RoundState, TEvent extends RoundEvent> {
  readonly state: TState;
  readonly events: readonly TEvent[];
}

/**
 * Contract every game implements. All functions are pure: same (state, action, rng sequence)
 * always yields the same output. No I/O, no clock, no global randomness.
 */
export interface Game<
  TConfig,
  TState extends RoundState,
  TAction,
  TEvent extends RoundEvent = RoundEvent,
> {
  readonly id: GameId;

  /** Start a round (e.g. deal initial cards, spin reels). */
  init(config: TConfig, rng: Rng): StepResult<TState, TEvent>;

  /** Apply a validated player intent. Throws/returns an error event on illegal actions. */
  applyAction(state: TState, action: TAction, rng: Rng): StepResult<TState, TEvent>;

  /** Rebuild state from persisted events (used for audit and replay). */
  replay(config: TConfig, events: readonly TEvent[]): TState;

  /** Compute the final settlement. Only valid once `state.status === 'SETTLED'`. */
  settle(state: TState): Settlement;
}

// TODO(phase-2): blackjack implements Game<...>
// TODO(phase-4): generic slot engine implements Game<...>
