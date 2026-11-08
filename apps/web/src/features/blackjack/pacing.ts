/**
 * Timings of the table at normal speed, in seconds. Cards and the event timeline both read
 * them, so a step never ends before its card has landed. "Rápida" multiplies everything by
 * `speedFactor('fast')`.
 */
export const PACING = {
  /** A card travelling from the shoe to its place, face down. */
  flight: 0.6,
  /** Turning a dealt card face up once it has landed. */
  flip: 0.35,
  /** Short beat after a card lands, before the next one leaves the shoe. */
  beat: 0.2,
  /** Suspense before the hole card turns. */
  revealPause: 0.5,
  /** The hole card turning over. */
  revealFlip: 0.6,
  /** Chips moving at the end of a round. */
  chips: 0.8,
} as const;

/** Time until a freshly dealt face-up card shows its value. */
export const CARD_LANDED_MS = (PACING.flight + PACING.flip) * 1000;
/** Time until the revealed hole card shows its value. */
export const HOLE_LANDED_MS = (PACING.revealPause + PACING.revealFlip) * 1000;
