import type { GameType } from './constants';

/**
 * Wire-format DTOs. Chip amounts travel as decimal strings because JSON cannot carry bigint.
 */
export type ChipAmountString = string;

export interface HealthResponseDto {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** Body of every error response produced by the API. */
export interface ApiErrorDto {
  statusCode: number;
  /** Stable, machine-readable code (e.g. `INSUFFICIENT_FUNDS`, `VALIDATION_FAILED`). */
  code: string;
  message: string;
  /** Validation details, when `code === 'VALIDATION_FAILED'`. */
  details?: string[];
  /** Same value as the `x-request-id` response header; quote it when reporting a problem. */
  requestId?: string;
}

// --- auth / users ---------------------------------------------------------------------

export type UserRole = 'PLAYER' | 'ADMIN';

export interface RegisterRequestDto {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

/**
 * Returned by register, login and refresh. The refresh token is NOT in the body: it is set as
 * an httpOnly cookie scoped to `/auth`.
 */
export interface AuthResponseDto {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  user: UserDto;
}

// --- wallet ---------------------------------------------------------------------------

export type LedgerDirectionDto = 'DEBIT' | 'CREDIT';
export type LedgerReasonDto = 'INITIAL_GRANT' | 'BET' | 'PAYOUT' | 'REFUND' | 'ADJUSTMENT';

export interface WalletBalanceDto {
  accountId: string;
  currency: string;
  balance: ChipAmountString;
}

/** One leg of the player's ledger, as seen from the player's account. */
export interface LedgerEntryDto {
  id: string;
  transactionId: string;
  /** DEBIT = chips out of the wallet, CREDIT = chips in. */
  direction: LedgerDirectionDto;
  reason: LedgerReasonDto;
  amount: ChipAmountString;
  balanceAfter: ChipAmountString;
  roundId: string | null;
  createdAt: string;
}

export interface LedgerHistoryDto {
  entries: LedgerEntryDto[];
  /** Pass as `?cursor=` to get the next (older) page; null when there are no more. */
  nextCursor: string | null;
}

export interface ReconciliationMismatchDto {
  accountId: string;
  cachedBalance: ChipAmountString;
  ledgerBalance: ChipAmountString;
}

export interface ReconciliationReportDto {
  checkedAt: string;
  accountsChecked: number;
  transactionsChecked: number;
  totalDebits: ChipAmountString;
  totalCredits: ChipAmountString;
  /** Accounts whose cached `balance` differs from Σ CREDIT − Σ DEBIT. */
  mismatches: ReconciliationMismatchDto[];
  /** Transactions whose legs do not sum to zero (should be impossible: DB-enforced). */
  unbalancedTransactionIds: string[];
  ok: boolean;
}

// --- fairness ---------------------------------------------------------------------------

/** The active pair: the server seed itself stays secret until rotation. */
export interface ActiveSeedPairDto {
  id: string;
  serverSeedHash: string;
  clientSeed: string;
  /** Nonce the next round will use. */
  nextNonce: number;
  createdAt: string;
}

/** A rotated pair: everything needed to verify all of its rounds. */
export interface RevealedSeedPairDto {
  id: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  /** Rounds played with nonces 0 .. nextNonce − 1. */
  nextNonce: number;
  createdAt: string;
  revealedAt: string;
}

export interface SeedsDto {
  active: ActiveSeedPairDto;
  revealed: RevealedSeedPairDto[];
}

export interface RotateSeedsRequestDto {
  /** New client seed for the next pair; a random one is generated if omitted. */
  clientSeed?: string;
}

export interface RotateSeedsResponseDto {
  revealed: RevealedSeedPairDto;
  active: ActiveSeedPairDto;
}

/** Fairness data attached to a round. `serverSeed` is only present once the pair is revealed. */
export interface RoundFairnessDto {
  seedPairId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  serverSeed: string | null;
}

// --- rounds ---------------------------------------------------------------------------

export type RoundStatusDto = 'CREATED' | 'IN_PROGRESS' | 'SETTLED' | 'VOIDED';

export interface RoundSummaryDto {
  id: string;
  game: GameType;
  status: RoundStatusDto;
  rulesVersion: string;
  bet: ChipAmountString;
  totalBet: ChipAmountString;
  payout: ChipAmountString | null;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
}

export interface RoundHistoryDto {
  rounds: RoundSummaryDto[];
  nextCursor: string | null;
}

// --- blackjack ------------------------------------------------------------------------

export type BlackjackActionTypeDto = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'INSURANCE';

export interface StartBlackjackRequestDto {
  bet: ChipAmountString;
}

export interface BlackjackActionRequestDto {
  action: BlackjackActionTypeDto;
  /** Only for INSURANCE. */
  take?: boolean;
  /** The `view.version` the client acted on; a stale version is rejected with 409. */
  version: number;
}

/**
 * A blackjack round as the player sees it. `TView` / `TEvent` are the engine's
 * `BlackjackPlayerView` / `BlackjackEvent` (typed by the client from @casino/game-engine).
 */
export interface BlackjackRoundDto<TView = unknown, TEvent = unknown> {
  round: RoundSummaryDto;
  view: TView;
  fairness: RoundFairnessDto;
  /**
   * Hole card hidden until revealed. Fetching a round: every event. Starting a round or acting:
   * only the events that request produced (the client animates them in order).
   */
  events?: TEvent[];
  /** Wallet balance after the request. */
  balance: ChipAmountString;
}

export interface ActiveBlackjackRoundDto<TView = unknown> {
  round: BlackjackRoundDto<TView> | null;
}
