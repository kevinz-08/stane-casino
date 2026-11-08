import { type Card, cardValue, handValue } from './cards';
import { canDouble, canSplit } from './engine';
import type { BlackjackAction, BlackjackState } from './types';

type Move = 'H' | 'S' | 'D' | 'Ds' | 'P';

/** Dealer upcard → index: 2..10 → 0..8, A → 9. */
const upIndex = (card: Card) => (cardValue(card) === 1 ? 9 : cardValue(card) - 2);

/* Total-dependent basic strategy for 4–8 decks, S17, DAS, no surrender (bj-v1).
 * Columns: dealer 2 3 4 5 6 7 8 9 T A.
 * D = double (else hit), Ds = double (else stand), P = split. */
const HARD: Record<number, Move[]> = {
  8: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
  12: ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
};

const SOFT: Record<number, Move[]> = {
  13: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  14: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  15: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  16: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  17: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  18: ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],
};

/** Pair (by card value, A = 1) → split? */
const PAIRS: Record<number, boolean[]> = {
  1: [true, true, true, true, true, true, true, true, true, true],
  2: [true, true, true, true, true, true, false, false, false, false],
  3: [true, true, true, true, true, true, false, false, false, false],
  4: [false, false, false, true, true, false, false, false, false, false],
  6: [true, true, true, true, true, false, false, false, false, false],
  7: [true, true, true, true, true, true, false, false, false, false],
  8: [true, true, true, true, true, true, true, true, true, true],
  9: [true, true, true, true, true, false, true, true, false, false],
};

/** Basic strategy decision (never takes insurance). Used by the simulator and tests. */
export function basicStrategy(state: BlackjackState): BlackjackAction {
  if (state.phase === 'INSURANCE') return { type: 'INSURANCE', take: false };
  const hand = state.hands[state.activeHand];
  const up = state.dealer.cards[0];
  if (!hand || !up) return { type: 'STAND' };
  const col = upIndex(up);

  if (canSplit(state)) {
    const pair = PAIRS[cardValue(hand.cards[0] as Card)];
    if (pair?.[col]) return { type: 'SPLIT' };
  }

  const { total, soft } = handValue(hand.cards);
  let move: Move;
  if (soft) move = total >= 19 ? 'S' : (((SOFT[total] ?? SOFT[13]) as Move[])[col] as Move);
  else if (total >= 17) move = 'S';
  else move = ((HARD[Math.max(total, 8)] ?? HARD[8]) as Move[])[col] as Move;

  if (move === 'D') return canDouble(state) ? { type: 'DOUBLE' } : { type: 'HIT' };
  if (move === 'Ds') return canDouble(state) ? { type: 'DOUBLE' } : { type: 'STAND' };
  return move === 'H' ? { type: 'HIT' } : { type: 'STAND' };
}
