/**
 * Table rules. Rounds store the `version` they were played with; rules are never edited in
 * place, a change means a new version (old rounds must keep verifying, ADR-003).
 */
export interface BlackjackRules {
  readonly version: string;
  readonly decks: number;
  /** Dealer stands on soft 17 (S17). */
  readonly dealerStandsSoft17: boolean;
  /** Blackjack pays numerator/denominator (3:2). */
  readonly blackjackPayout: readonly [numerator: bigint, denominator: bigint];
  /** Dealer checks for blackjack with an A or 10-value upcard (US hole-card game). */
  readonly dealerPeeks: boolean;
  readonly doubleAfterSplit: boolean;
  /** Maximum number of player hands after splitting. */
  readonly maxHands: number;
  readonly resplitAces: boolean;
  /** Split aces get exactly one card each. */
  readonly oneCardOnSplitAces: boolean;
  readonly insurance: boolean;
}

/**
 * v1: 6 decks, fresh shuffle every round, S17, BJ 3:2, peek, double on any two cards, DAS,
 * split up to 4 hands (no resplitting aces, one card to each split ace), insurance, no surrender.
 *
 * Reference house edge with basic strategy: ≈ 0.41 %. Wizard of Odds' calculator gives
 * 0.334 % for the same game WITH late surrender, which is worth ≈ 0.08 % to the player.
 */
export const BLACKJACK_RULES_V1: BlackjackRules = {
  version: 'bj-v1',
  decks: 6,
  dealerStandsSoft17: true,
  blackjackPayout: [3n, 2n],
  dealerPeeks: true,
  doubleAfterSplit: true,
  maxHands: 4,
  resplitAces: false,
  oneCardOnSplitAces: true,
  insurance: true,
};

export const BLACKJACK_REFERENCE_HOUSE_EDGE_V1 = 0.0041;

export const BLACKJACK_RULES: Readonly<Record<string, BlackjackRules>> = {
  [BLACKJACK_RULES_V1.version]: BLACKJACK_RULES_V1,
};

export function rulesFor(version: string): BlackjackRules {
  const rules = BLACKJACK_RULES[version];
  if (!rules) throw new Error(`unknown blackjack rules version: ${version}`);
  return rules;
}
