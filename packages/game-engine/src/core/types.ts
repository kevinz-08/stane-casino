/** Integer amount of virtual chips (never a float). */
export type Chips = bigint;

export type GameId = 'blackjack' | 'slots';

export type RoundStatus = 'CREATED' | 'IN_PROGRESS' | 'SETTLED' | 'VOIDED';

/**
 * Immutable fact that happened in a round. A round is fully reproducible by replaying its
 * ordered events. Events carry NO wall-clock time: timestamps are added at persistence.
 */
export interface RoundEvent<TType extends string = string, TPayload = unknown> {
  /** Position in the round, starting at 0, strictly increasing. */
  readonly seq: number;
  readonly type: TType;
  readonly payload: TPayload;
}

/** Minimal state every game shares; each game extends it with its own fields. */
export interface RoundState {
  readonly status: RoundStatus;
  readonly bet: Chips;
}

/** Net result of a settled round. `payout` is the total returned to the player (stake included). */
export interface Settlement {
  readonly bet: Chips;
  readonly payout: Chips;
}
