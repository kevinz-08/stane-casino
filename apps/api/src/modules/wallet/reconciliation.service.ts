import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ReconciliationReport {
  checkedAt: Date;
  accountsChecked: number;
  transactionsChecked: number;
  totalDebits: bigint;
  totalCredits: bigint;
  mismatches: Array<{ accountId: string; cachedBalance: bigint; ledgerBalance: bigint }>;
  unbalancedTransactionIds: string[];
  ok: boolean;
}

/**
 * Verifies the ledger against the cached balances:
 *  - every account: `balance` == Σ CREDIT − Σ DEBIT of its entries;
 *  - every transaction: Σ DEBIT == Σ CREDIT with at least two legs;
 *  - globally: Σ DEBIT == Σ CREDIT.
 * Runs in one REPEATABLE READ snapshot, so concurrent transfers cannot produce false alarms.
 * Sums are computed as text because SUM(bigint) is NUMERIC and may exceed bigint.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  /** @param accountIds restrict the check to these accounts and their transactions. */
  async reconcile(accountIds?: string[]): Promise<ReconciliationReport> {
    if (accountIds?.length === 0) {
      return {
        checkedAt: new Date(),
        accountsChecked: 0,
        transactionsChecked: 0,
        totalDebits: 0n,
        totalCredits: 0n,
        mismatches: [],
        unbalancedTransactionIds: [],
        ok: true,
      };
    }
    const accountFilter = accountIds
      ? Prisma.sql`WHERE a."id" IN (${Prisma.join(accountIds)})`
      : Prisma.empty;
    const entryFilter = accountIds
      ? Prisma.sql`WHERE e."transactionId" IN (
          SELECT "transactionId" FROM "LedgerEntry" WHERE "accountId" IN (${Prisma.join(accountIds)}))`
      : Prisma.empty;

    return this.prisma.$transaction(
      async (db) => {
        const accounts = await db.$queryRaw<Array<{ id: string; cached: bigint; ledger: string }>>`
          SELECT a."id", a."balance" AS "cached",
                 COALESCE(SUM(CASE WHEN e."direction" = 'CREDIT' THEN e."amount"
                                   ELSE -e."amount" END), 0)::text AS "ledger"
          FROM "Account" a
          LEFT JOIN "LedgerEntry" e ON e."accountId" = a."id"
          ${accountFilter}
          GROUP BY a."id", a."balance"`;

        const transactions = await db.$queryRaw<
          Array<{ transactionId: string; debits: string; credits: string; legs: number }>
        >`
          SELECT e."transactionId",
                 COALESCE(SUM(CASE WHEN e."direction" = 'DEBIT'  THEN e."amount" END), 0)::text AS "debits",
                 COALESCE(SUM(CASE WHEN e."direction" = 'CREDIT' THEN e."amount" END), 0)::text AS "credits",
                 COUNT(*)::int AS "legs"
          FROM "LedgerEntry" e
          ${entryFilter}
          GROUP BY e."transactionId"`;

        let totalDebits = 0n;
        let totalCredits = 0n;
        const unbalancedTransactionIds: string[] = [];
        for (const t of transactions) {
          const debits = BigInt(t.debits);
          const credits = BigInt(t.credits);
          totalDebits += debits;
          totalCredits += credits;
          if (debits !== credits || t.legs < 2) unbalancedTransactionIds.push(t.transactionId);
        }

        const mismatches = accounts
          .map((a) => ({
            accountId: a.id,
            cachedBalance: a.cached,
            ledgerBalance: BigInt(a.ledger),
          }))
          .filter((a) => a.cachedBalance !== a.ledgerBalance);

        return {
          checkedAt: new Date(),
          accountsChecked: accounts.length,
          transactionsChecked: transactions.length,
          totalDebits,
          totalCredits,
          mismatches,
          unbalancedTransactionIds,
          ok:
            mismatches.length === 0 &&
            unbalancedTransactionIds.length === 0 &&
            totalDebits === totalCredits,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 },
    );
  }
}
