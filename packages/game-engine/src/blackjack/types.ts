import type { Chips, RoundEvent, RoundState } from '../core';
import type { Card } from './cards';

/** Chip amounts inside events are decimal strings so events are plain JSON. */
export type ChipString = string;

export type HandStatus = 'PLAYING' | 'STOOD' | 'BUSTED';
export type HandResult = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE';
export type Phase = 'INSURANCE' | 'PLAYER' | 'SETTLED';

export interface PlayerHand {
  readonly cards: readonly Card[];
  readonly bet: Chips;
  readonly doubled: boolean;
  readonly fromSplit: boolean;
  readonly splitAces: boolean;
  readonly status: HandStatus;
  readonly result: HandResult | null;
  readonly payout: Chips | null;
}

export interface BlackjackState extends RoundState {
  readonly rulesVersion: string;
  readonly phase: Phase;
  readonly dealer: {
    readonly cards: readonly Card[];
    readonly holeRevealed: boolean;
  };
  readonly hands: readonly PlayerHand[];
  readonly activeHand: number;
  /** Cards taken from the shoe so far (= next shoe position). */
  readonly cardsDealt: number;
  readonly insurance: { readonly offered: boolean; readonly bet: Chips | null };
  /** Σ stakes: every hand (doubles and splits included) plus insurance. */
  readonly totalBet: Chips;
  /** Total returned to the player (stakes included); null until settled. */
  readonly payout: Chips | null;
  /** seq of the next event. */
  readonly nextSeq: number;
}

export type BlackjackAction =
  | { readonly type: 'HIT' }
  | { readonly type: 'STAND' }
  | { readonly type: 'DOUBLE' }
  | { readonly type: 'SPLIT' }
  | { readonly type: 'INSURANCE'; readonly take: boolean };

export type BlackjackActionType = BlackjackAction['type'];

type E<T extends string, P> = RoundEvent<T, P>;

export type BlackjackEvent =
  | E<'ROUND_STARTED', { rulesVersion: string; bet: ChipString }>
  | E<'CARD_DEALT', { to: 'PLAYER'; hand: number; card: Card; position: number }>
  | E<'CARD_DEALT', { to: 'DEALER'; card: Card; faceDown: boolean; position: number }>
  | E<'INSURANCE_OFFERED', Record<string, never>>
  // --- player decisions (the only events that come from player input) ---
  | E<'INSURANCE_DECIDED', { take: boolean; amount: ChipString }>
  | E<'HAND_HIT', { hand: number }>
  | E<'HAND_STOOD', { hand: number }>
  | E<'HAND_DOUBLED', { hand: number; additionalBet: ChipString }>
  | E<'HAND_SPLIT', { hand: number; newHand: number; additionalBet: ChipString }>
  // --- automatic consequences ---
  | E<'DEALER_PEEKED', { blackjack: boolean }>
  | E<'ACTIVE_HAND_CHANGED', { hand: number }>
  | E<'HOLE_CARD_REVEALED', { card: Card }>
  | E<
      'ROUND_SETTLED',
      {
        hands: Array<{ hand: number; result: HandResult; payout: ChipString }>;
        insurancePayout: ChipString;
        totalBet: ChipString;
        payout: ChipString;
      }
    >;

export type BlackjackEventType = BlackjackEvent['type'];

export interface BlackjackConfig {
  readonly bet: Chips;
  readonly rulesVersion?: string;
}

export type IllegalActionCode =
  | 'ROUND_SETTLED'
  | 'INSURANCE_PENDING'
  | 'INSURANCE_NOT_OFFERED'
  | 'CANNOT_DOUBLE'
  | 'CANNOT_SPLIT'
  | 'INVALID_BET'
  | 'UNKNOWN_ACTION';

export class IllegalActionError extends Error {
  constructor(
    readonly code: IllegalActionCode,
    message: string,
  ) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
