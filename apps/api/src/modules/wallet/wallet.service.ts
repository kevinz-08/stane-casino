import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountType,
  LedgerDirection,
  LedgerReason,
  Prisma,
  type LedgerEntry,
  type LedgerTransaction,
} from '@prisma/client';
import { CURRENCY, INITIAL_CHIP_GRANT } from '@casino/shared';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { isPrismaError, PrismaErrorCode, PrismaService } from '../../infra/prisma/prisma.service';
import {
  AccountNotFoundError,
  IdempotencyKeyConflictError,
  InsufficientFundsError,
  InvalidTransferError,
} from './wallet.errors';
import {
  type HistoryPage,
  type LedgerLeg,
  type LedgerTransactionResult,
  type PlayerAccount,
  SYSTEM_ACCOUNTS,
  type TransferCommand,
  type TransferOutcome,
} from './wallet.types';

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_CONFLICT_RETRIES = 3;

interface LockedAccount {
  id: string;
  type: AccountType;
  balance: bigint;
}

/**
 * The wallet is the only writer of `Account`, `LedgerTransaction` and `LedgerEntry` (ADR-002).
 *
 * Every movement of chips is a `transfer`: one transaction row (the idempotency gate) plus a
 * DEBIT and a CREDIT leg, all in one PostgreSQL transaction that also updates the cached
 * balances. Concurrency rules:
 *  - accounts are locked with `SELECT ... FOR UPDATE` in ascending id order, so two transfers
 *    can never wait on each other in a cycle (no deadlocks);
 *  - the funds check happens after the lock, against the locked balance;
 *  - the unique `idempotencyKey` makes concurrent duplicates block on the first one and then
 *    fail with a unique violation, after which they return the stored result.
 * The database backs all of this up (CHECKs, append-only triggers, balanced-transaction trigger).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // --- accounts -------------------------------------------------------------------------

  /**
   * Ensures the user has a chip wallet and has received the initial grant. Idempotent: safe to
   * call on every registration/login (it self-heals a registration interrupted half-way).
   */
  async openPlayerWallet(userId: string): Promise<PlayerAccount> {
    const account = await this.findOrCreatePlayerAccount(userId);
    await this.transfer({
      idempotencyKey: `initial-grant:${userId}`,
      reason: LedgerReason.INITIAL_GRANT,
      fromAccountId: SYSTEM_ACCOUNTS.FAUCET,
      toAccountId: account.id,
      amount: INITIAL_CHIP_GRANT,
    });
    // Re-read: on a replay the stored balanceAfter is historical, not the live balance.
    return this.getPlayerAccount(userId);
  }

  async getPlayerAccount(userId: string): Promise<PlayerAccount> {
    const account = await this.prisma.account.findUnique({
      where: {
        userId_type_currency: { userId, type: AccountType.PLAYER_WALLET, currency: CURRENCY },
      },
    });
    if (!account) throw new AccountNotFoundError(`wallet of user ${userId}`);
    return toPlayerAccount(account);
  }

  private async findOrCreatePlayerAccount(userId: string): Promise<PlayerAccount> {
    const where = {
      userId_type_currency: { userId, type: AccountType.PLAYER_WALLET, currency: CURRENCY },
    };
    const existing = await this.prisma.account.findUnique({ where });
    if (existing) return toPlayerAccount(existing);
    try {
      return toPlayerAccount(
        await this.prisma.account.create({
          data: { userId, type: AccountType.PLAYER_WALLET, currency: CURRENCY },
        }),
      );
    } catch (error) {
      // Another request created it concurrently.
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        return toPlayerAccount(await this.prisma.account.findUniqueOrThrow({ where }));
      }
      throw error;
    }
  }

  // --- transfers ------------------------------------------------------------------------

  async transfer(command: TransferCommand): Promise<TransferOutcome> {
    validate(command);
    const requestHash = hashRequest(command);

    const previous = await this.findByKey(command.idempotencyKey);
    if (previous) return this.replay(previous, requestHash);

    try {
      const transaction = await this.withConflictRetry(() => this.post(command, requestHash));
      return { transaction, replayed: false };
    } catch (error) {
      // A concurrent request with the same key committed first.
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        const winner = await this.findByKey(command.idempotencyKey);
        if (winner) return this.replay(winner, requestHash);
      }
      throw error;
    }
  }

  private post(command: TransferCommand, requestHash: string): Promise<LedgerTransactionResult> {
    const { fromAccountId, toAccountId, amount } = command;

    return this.prisma.$transaction(
      async (db) => {
        // 1. Idempotency gate. A concurrent duplicate blocks here until we commit or roll back.
        const tx = await db.ledgerTransaction.create({
          data: {
            idempotencyKey: command.idempotencyKey,
            requestHash,
            reason: command.reason,
            roundId: command.roundId ?? null,
          },
        });

        // 2. Lock both accounts in a global order (ascending id) to rule out deadlocks.
        const locked = new Map<string, LockedAccount>();
        for (const id of [fromAccountId, toAccountId].sort()) {
          const rows = await db.$queryRaw<LockedAccount[]>`
            SELECT "id", "type"::text AS "type", "balance"
            FROM "Account" WHERE "id" = ${id} FOR UPDATE`;
          const row = rows[0];
          if (!row) throw new AccountNotFoundError(id);
          locked.set(id, row);
        }

        // 3. Funds check against the locked balance. System accounts may go negative.
        const from = locked.get(fromAccountId) as LockedAccount;
        if (from.type === AccountType.PLAYER_WALLET && from.balance < amount) {
          throw new InsufficientFundsError(from.id, from.balance, amount);
        }

        // 4. Update cached balances and write the two legs.
        const debited = await db.account.update({
          where: { id: fromAccountId },
          data: { balance: { decrement: amount } },
          select: { balance: true },
        });
        const credited = await db.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: amount } },
          select: { balance: true },
        });

        const legs: LedgerLeg[] = [
          {
            accountId: fromAccountId,
            direction: LedgerDirection.DEBIT,
            amount,
            balanceAfter: debited.balance,
          },
          {
            accountId: toAccountId,
            direction: LedgerDirection.CREDIT,
            amount,
            balanceAfter: credited.balance,
          },
        ];
        await db.ledgerEntry.createMany({
          data: legs.map((leg) => ({ ...leg, transactionId: tx.id })),
        });

        return toResult(tx, legs);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: this.config.wallet.txMaxWaitMs,
        timeout: this.config.wallet.txTimeoutMs,
      },
    );
  }

  private async withConflictRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!isPrismaError(error, PrismaErrorCode.TransactionConflict)) throw error;
        if (attempt >= MAX_CONFLICT_RETRIES) throw error;
        this.logger.warn({ attempt }, 'ledger transaction conflict, retrying');
      }
    }
  }

  private findByKey(idempotencyKey: string) {
    return this.prisma.ledgerTransaction.findUnique({
      where: { idempotencyKey },
      include: { entries: true },
    });
  }

  private replay(
    stored: LedgerTransaction & { entries: LedgerEntry[] },
    requestHash: string,
  ): TransferOutcome {
    if (stored.requestHash !== requestHash) {
      throw new IdempotencyKeyConflictError(stored.idempotencyKey);
    }
    const legs = stored.entries
      .map((e) => ({
        accountId: e.accountId,
        direction: e.direction,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
      }))
      .sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'DEBIT' ? -1 : 1));
    return { transaction: toResult(stored, legs), replayed: true };
  }

  // --- queries --------------------------------------------------------------------------

  /** Player's ledger, newest first, cursor-paginated by entry id. */
  async getHistory(
    userId: string,
    options: { cursor?: string; limit: number },
  ): Promise<HistoryPage> {
    const account = await this.getPlayerAccount(userId);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      include: { transaction: { select: { reason: true, roundId: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, options.limit);
    return {
      entries: page.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        direction: e.direction,
        reason: e.transaction.reason,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
        roundId: e.transaction.roundId,
        createdAt: e.createdAt,
      })),
      nextCursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

function validate(command: TransferCommand): void {
  const key = command.idempotencyKey;
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new InvalidTransferError(
      `idempotencyKey must have 1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    );
  }
  if (typeof command.amount !== 'bigint' || command.amount <= 0n) {
    throw new InvalidTransferError('amount must be a positive integer (bigint)');
  }
  if (command.fromAccountId === command.toAccountId) {
    throw new InvalidTransferError('cannot transfer to the same account');
  }
}

/** Fingerprint of everything that defines the operation, to detect key reuse. */
function hashRequest(command: TransferCommand): string {
  const canonical = JSON.stringify([
    command.reason,
    command.fromAccountId,
    command.toAccountId,
    command.amount.toString(),
    command.roundId ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

function toResult(tx: LedgerTransaction, legs: LedgerLeg[]): LedgerTransactionResult {
  return {
    transactionId: tx.id,
    idempotencyKey: tx.idempotencyKey,
    reason: tx.reason,
    roundId: tx.roundId,
    createdAt: tx.createdAt,
    legs,
  };
}

function toPlayerAccount(account: {
  id: string;
  userId: string | null;
  currency: string;
  balance: bigint;
}): PlayerAccount {
  return {
    id: account.id,
    userId: account.userId as string,
    currency: account.currency,
    balance: account.balance,
  };
}
