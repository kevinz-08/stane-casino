import type { LedgerDirection, LedgerReason } from '@prisma/client';

/** System accounts, created by the initial migration with these fixed ids. */
export const SYSTEM_ACCOUNTS = {
  HOUSE: 'sys_house_chip',
  FAUCET: 'sys_faucet_chip',
} as const;

export interface TransferCommand {
  /**
   * Caller-chosen key identifying the business operation (e.g. `bet:<roundId>`). Retrying with
   * the same key and the same payload returns the original transaction; with a different payload
   * it fails with `IdempotencyKeyConflictError`.
   */
  idempotencyKey: string;
  reason: LedgerReason;
  /** Account the chips leave (DEBIT leg). */
  fromAccountId: string;
  /** Account the chips enter (CREDIT leg). */
  toAccountId: string;
  /** Integer chips, > 0. */
  amount: bigint;
  roundId?: string;
}

export interface LedgerLeg {
  accountId: string;
  direction: LedgerDirection;
  amount: bigint;
  balanceAfter: bigint;
}

export interface LedgerTransactionResult {
  transactionId: string;
  idempotencyKey: string;
  reason: LedgerReason;
  roundId: string | null;
  createdAt: Date;
  /** DEBIT leg first, then CREDIT. */
  legs: LedgerLeg[];
}

export interface TransferOutcome {
  transaction: LedgerTransactionResult;
  /** True when the key had already been processed and the stored result was returned. */
  replayed: boolean;
}

export interface PlayerAccount {
  id: string;
  userId: string;
  currency: string;
  balance: bigint;
}

export interface HistoryPage {
  entries: Array<{
    id: string;
    transactionId: string;
    direction: LedgerDirection;
    reason: LedgerReason;
    amount: bigint;
    balanceAfter: bigint;
    roundId: string | null;
    createdAt: Date;
  }>;
  nextCursor: string | null;
}
