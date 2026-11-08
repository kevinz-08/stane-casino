import { type Card, handValue } from './cards';
import { allowedActions } from './engine';
import type {
  BlackjackActionType,
  BlackjackEvent,
  BlackjackState,
  ChipString,
  HandResult,
  HandStatus,
  Phase,
} from './types';

/**
 * What the player may see. The dealer's hole card is `null` until it is revealed; the shoe and
 * the server seed never leave the server. Plain JSON (chip amounts as strings).
 */
export interface BlackjackPlayerView {
  rulesVersion: string;
  phase: Phase;
  bet: ChipString;
  totalBet: ChipString;
  payout: ChipString | null;
  dealer: { cards: Array<Card | null>; total: number | null; holeRevealed: boolean };
  hands: Array<{
    cards: Card[];
    bet: ChipString;
    total: number;
    soft: boolean;
    doubled: boolean;
    fromSplit: boolean;
    status: HandStatus;
    result: HandResult | null;
    payout: ChipString | null;
  }>;
  activeHand: number;
  insurance: { offered: boolean; bet: ChipString | null };
  allowedActions: BlackjackActionType[];
  /** seq of the next event: send it back with the next action (optimistic concurrency). */
  version: number;
}

export function toPlayerView(state: BlackjackState): BlackjackPlayerView {
  const visibleDealer = state.dealer.cards.map((card, i) =>
    i === 1 && !state.dealer.holeRevealed ? null : card,
  );
  const shown = visibleDealer.filter((c): c is Card => c !== null);
  return {
    rulesVersion: state.rulesVersion,
    phase: state.phase,
    bet: state.bet.toString(),
    totalBet: state.totalBet.toString(),
    payout: state.payout?.toString() ?? null,
    dealer: {
      cards: visibleDealer,
      total: shown.length > 0 ? handValue(shown).total : null,
      holeRevealed: state.dealer.holeRevealed,
    },
    hands: state.hands.map((hand) => {
      const value = handValue(hand.cards);
      return {
        cards: [...hand.cards],
        bet: hand.bet.toString(),
        total: value.total,
        soft: value.soft,
        doubled: hand.doubled,
        fromSplit: hand.fromSplit,
        status: hand.status,
        result: hand.result,
        payout: hand.payout?.toString() ?? null,
      };
    }),
    activeHand: state.activeHand,
    insurance: {
      offered: state.insurance.offered,
      bet: state.insurance.bet?.toString() ?? null,
    },
    allowedActions: allowedActions(state),
    version: state.nextSeq,
  };
}

/** Event log safe for the player: the face-down card is hidden until HOLE_CARD_REVEALED. */
export function redactEvents(events: readonly BlackjackEvent[]): BlackjackEvent[] {
  const revealed = events.some((e) => e.type === 'HOLE_CARD_REVEALED');
  if (revealed) return [...events];
  return events.map((e) =>
    e.type === 'CARD_DEALT' && e.payload.to === 'DEALER' && e.payload.faceDown
      ? ({ ...e, payload: { ...e.payload, card: null } } as unknown as BlackjackEvent)
      : e,
  );
}
