export const APP_NAME = 'casino';

/** Games exposed by the platform. Keep in sync with the Prisma `GameType` enum. */
export const GAME_TYPES = ['BLACKJACK', 'SLOTS'] as const;
export type GameType = (typeof GAME_TYPES)[number];

/** The only currency: virtual chips, stored as integer amounts (no decimals, no real money). */
export const CURRENCY = 'CHIP';

/** Chips granted once to every new player wallet (from the FAUCET system account). */
export const INITIAL_CHIP_GRANT = 10_000n;

/** Password policy, checked by the API and mirrored by the web forms. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 32;

/** Name of the httpOnly cookie carrying the refresh token (scoped to `/auth`). */
export const REFRESH_COOKIE_NAME = 'casino_rt';

/** Header used to correlate a request across logs and error responses. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Blackjack table limits. Bets must be even so 3:2 payouts and insurance stay in whole chips. */
export const BLACKJACK_MIN_BET = 10n;
export const BLACKJACK_MAX_BET = 1_000n;

/** Allowed characters of a player-chosen client seed. */
export const CLIENT_SEED_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
