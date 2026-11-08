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

// TODO(phase-2): BetIntentDto, RoundEventDto, SeedCommitmentDto
