import type { INestApplication } from '@nestjs/common';
import { LedgerReason } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountNotFoundError,
  IdempotencyKeyConflictError,
  InsufficientFundsError,
} from '../src/modules/wallet/wallet.errors';
import type { TransferCommand } from '../src/modules/wallet/wallet.types';
import { balanceOf, createPlayer, createTestApp, services, SYSTEM_ACCOUNTS } from './helpers';

describe('wallet idempotency (real PostgreSQL)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  const bet = (accountId: string, key: string, amount = 10n): TransferCommand => ({
    idempotencyKey: key,
    reason: LedgerReason.BET,
    fromAccountId: accountId,
    toAccountId: SYSTEM_ACCOUNTS.HOUSE,
    amount,
  });

  it('the same key sent 50 times in parallel → one set of entries and the same response', async () => {
    const { wallet, prisma } = services(app);
    const { account } = await createPlayer(app, 1_000n);
    const key = `bet:parallel:${account.id}`;

    const outcomes = await Promise.all(
      Array.from({ length: 50 }, () => wallet.transfer(bet(account.id, key))),
    );

    const stored = await prisma.ledgerTransaction.findMany({
      where: { idempotencyKey: key },
      include: { entries: true },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.entries).toHaveLength(2);
    expect(await balanceOf(app, account.id)).toBe(990n);

    expect(outcomes.filter((o) => !o.replayed)).toHaveLength(1);
    const [first, ...rest] = outcomes.map((o) => o.transaction);
    for (const other of rest) expect(other).toEqual(first);
    expect(first?.legs).toEqual([
      {
        accountId: account.id,
        direction: 'DEBIT',
        amount: 10n,
        balanceAfter: 990n,
      },
      expect.objectContaining({ accountId: SYSTEM_ACCOUNTS.HOUSE, direction: 'CREDIT' }),
    ]);
  });

  it('a later retry returns the stored response, even after the balance changed', async () => {
    const { wallet } = services(app);
    const { account } = await createPlayer(app, 100n);

    const original = await wallet.transfer(bet(account.id, `bet:retry:${account.id}`));
    await wallet.transfer(bet(account.id, `bet:other:${account.id}`, 50n));
    const retry = await wallet.transfer(bet(account.id, `bet:retry:${account.id}`));

    expect(retry.replayed).toBe(true);
    expect(retry.transaction).toEqual(original.transaction);
    expect(await balanceOf(app, account.id)).toBe(40n);
  });

  it('reusing a key for a different operation is rejected', async () => {
    const { wallet } = services(app);
    const { account } = await createPlayer(app, 100n);
    const key = `bet:conflict:${account.id}`;

    await wallet.transfer(bet(account.id, key, 10n));
    await expect(wallet.transfer(bet(account.id, key, 20n))).rejects.toBeInstanceOf(
      IdempotencyKeyConflictError,
    );
    // Concurrent variant: the losers find a different payload behind the key.
    const { account: other } = await createPlayer(app, 100n);
    const results = await Promise.allSettled([
      wallet.transfer(bet(other.id, `bet:race:${other.id}`, 1n)),
      wallet.transfer(bet(other.id, `bet:race:${other.id}`, 2n)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(failed?.reason).toBeInstanceOf(IdempotencyKeyConflictError);
    expect(await balanceOf(app, account.id)).toBe(90n);
  });

  it('a failed operation leaves no trace, so the same key can succeed later', async () => {
    const { wallet, prisma } = services(app);
    const { account } = await createPlayer(app, 5n);
    const key = `bet:after-topup:${account.id}`;

    await expect(wallet.transfer(bet(account.id, key, 10n))).rejects.toBeInstanceOf(
      InsufficientFundsError,
    );
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(0);

    await wallet.transfer({
      idempotencyKey: `topup:${account.id}`,
      reason: LedgerReason.ADJUSTMENT,
      fromAccountId: SYSTEM_ACCOUNTS.FAUCET,
      toAccountId: account.id,
      amount: 5n,
    });
    const outcome = await wallet.transfer(bet(account.id, key, 10n));
    expect(outcome.replayed).toBe(false);
    expect(await balanceOf(app, account.id)).toBe(0n);
  });

  it('rejects unknown accounts without writing anything', async () => {
    const { wallet, prisma } = services(app);
    const key = `bet:ghost:${Date.now()}`;
    await expect(
      wallet.transfer({ ...bet('does-not-exist', key), fromAccountId: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).toBe(0);
  });
});
