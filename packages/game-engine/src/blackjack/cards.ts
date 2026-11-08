export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const SUITS = ['S', 'H', 'D', 'C'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** Two characters: rank + suit, e.g. `AS` (ace of spades), `TD` (ten of diamonds). */
export type Card = `${Rank}${Suit}`;

/**
 * Canonical (unshuffled) shoe: for each deck, suits in S,H,D,C order, ranks A..K.
 * Part of the verifiable scheme: the shuffle permutes THIS order.
 */
export function canonicalShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) shoe.push(`${rank}${suit}`);
  }
  return shoe;
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

/** Blackjack value of a card: A = 1 (soft handling in `handValue`), T/J/Q/K = 10. */
export function cardValue(card: Card): number {
  const rank = rankOf(card);
  if (rank === 'A') return 1;
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export interface HandValue {
  total: number;
  /** An ace is counted as 11 without busting. */
  soft: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const v = cardValue(card);
    total += v;
    if (v === 1) aces++;
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

/** Two-card 21. (Whether it counts as a blackjack after a split is decided by the caller.) */
export function isNatural(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isCard(value: unknown): value is Card {
  return (
    typeof value === 'string' &&
    value.length === 2 &&
    (RANKS as readonly string[]).includes(value[0] as string) &&
    (SUITS as readonly string[]).includes(value[1] as string)
  );
}
