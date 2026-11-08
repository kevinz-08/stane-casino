import type { INestApplication } from '@nestjs/common';
import { LedgerReason } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsufficientFundsError } from '../src/modules/wallet/wallet.errors';
import { balanceOf, createPlayer, createTestApp, services, SYSTEM_ACCOUNTS } from './helpers';

describe('wallet under concurrency (real PostgreSQL)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('200 concurrent debits on an account funded for 100 → exactly 100 succeed', async () => {
    const { wallet, prisma, reconciliation } = services(app);
    const { account } = await createPlayer(app, 100n);

    const results = await Promise.allSettled(
      Array.from({ length: 200 }, (_, i) =>
        wallet.transfer({
          idempotencyKey: `load:${account.id}:${i}`,
          reason: LedgerReason.BET,
          fromAccountId: account.id,
          toAccountId: SYSTEM_ACCOUNTS.HOUSE,
          amount: 1n,
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(100);
    expect(rejected).toHaveLength(100);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientFundsError);

    expect(await balanceOf(app, account.id)).toBe(0n);
    // 1 funding credit + 100 bet debits; failed attempts leave no trace.
    expect(await prisma.ledgerEntry.count({ where: { accountId: account.id } })).toBe(101);

    const report = await reconciliation.reconcile([account.id]);
    expect(report.ok).toBe(true);
    expect(report.totalDebits).toBe(report.totalCredits);
  });

  it('opposite-direction transfers between the same two wallets do not deadlock', async () => {
    const { wallet, reconciliation } = services(app);
    const a = await createPlayer(app, 1_000n);
    const b = await createPlayer(app, 1_000n);

    const ops = Array.from({ length: 100 }, (_, i) => {
      const [from, to] = i % 2 === 0 ? [a, b] : [b, a];
      return wallet.transfer({
        idempotencyKey: `swap:${a.account.id}:${i}`,
        reason: LedgerReason.ADJUSTMENT,
        fromAccountId: from.account.id,
        toAccountId: to.account.id,
        amount: BigInt(i + 1),
      });
    });
    const results = await Promise.allSettled(ops);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    // Even i (a→b) sum = 1+3+...+99 = 2500; odd i (b→a) sum = 2+4+...+100 = 2550.
    expect(await balanceOf(app, a.account.id)).toBe(1_000n - 2_500n + 2_550n);
    expect(await balanceOf(app, b.account.id)).toBe(1_000n + 2_500n - 2_550n);
    expect((await reconciliation.reconcile([a.account.id, b.account.id])).ok).toBe(true);
  });
});
