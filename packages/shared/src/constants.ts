export const APP_NAME = 'casino';

/** Games exposed by the platform. Keep in sync with the Prisma `GameType` enum. */
export const GAME_TYPES = ['BLACKJACK', 'SLOTS'] as const;
export type GameType = (typeof GAME_TYPES)[number];

/** The only currency: virtual chips, stored as integer amounts (no decimals, no real money). */
export const CURRENCY = 'CHIP';

// TODO(phase-1): bet limits, starting balance, daily faucet amount
