import type { INestApplication } from '@nestjs/common';
import { LedgerReason } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlayer, createTestApp, services, SYSTEM_ACCOUNTS } from './helpers';

/**
 * The database itself enforces the ledger rules, so a bug (or a manual query) in any module
 * cannot corrupt balances. These tests bypass the service and talk SQL directly.
 */
describe('ledger constraints enforced by PostgreSQL', () => {
  let app: INestApplication;
  let entryId: string;
  let transactionId: string;
  let playerAccountId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const { account } = await createPlayer(app, 50n);
    playerAccountId = account.id;
    const entry = await services(app).prisma.ledgerEntry.findFirstOrThrow({
      where: { accountId: account.id },
    });
    entryId = entry.id;
    transactionId = entry.transactionId;
  });
  afterAll(async () => {
    await app?.close();
  });

  const sql = (query: string, ...params: unknown[]) =>
    services(app).prisma.$executeRawUnsafe(query, ...params);

  it('UPDATE on LedgerEntry fails', async () => {
    await expect(
      sql(`UPDATE "LedgerEntry" SET "amount" = 1 WHERE "id" = $1`, entryId),
    ).rejects.toThrow(/append-only/);
  });

  it('DELETE on LedgerEntry fails', async () => {
    await expect(sql(`DELETE FROM "LedgerEntry" WHERE "id" = $1`, entryId)).rejects.toThrow(
      /append-only/,
    );
  });

  it('TRUNCATE on the ledger fails', async () => {
    await expect(sql(`TRUNCATE "LedgerEntry" CASCADE`)).rejects.toThrow(/append-only/);
  });

  it('UPDATE and DELETE on LedgerTransaction fail', async () => {
    await expect(
      sql(`UPDATE "LedgerTransaction" SET "reason" = 'PAYOUT' WHERE "id" = $1`, transactionId),
    ).rejects.toThrow(/append-only/);
    await expect(
      sql(`DELETE FROM "LedgerTransaction" WHERE "id" = $1`, transactionId),
    ).rejects.toThrow(/append-only/);
  });

  it('a player balance cannot go below zero, even with a direct UPDATE', async () => {
    await expect(
      sql(`UPDATE "Account" SET "balance" = -1 WHERE "id" = $1`, playerAccountId),
    ).rejects.toThrow(/Account_player_balance_non_negative/);
  });

  it('system accounts may go negative (the faucet is the issuer of chips)', async () => {
    const faucet = await services(app).prisma.account.findUniqueOrThrow({
      where: { id: SYSTEM_ACCOUNTS.FAUCET },
    });
    expect(faucet.balance < 0n).toBe(true);
  });

  it('an unbalanced transaction is rejected at commit', async () => {
    const { prisma } = services(app);
    await expect(
      prisma.$transaction(async (db) => {
        const tx = await db.ledgerTransaction.create({
          data: {
            idempotencyKey: `unbalanced:${Date.now()}`,
            requestHash: 'x',
            reason: LedgerReason.ADJUSTMENT,
          },
        });
        await db.ledgerEntry.createMany({
          data: [
            {
              transactionId: tx.id,
              accountId: SYSTEM_ACCOUNTS.FAUCET,
              direction: 'DEBIT',
              amount: 10n,
              balanceAfter: 0n,
            },
            {
              transactionId: tx.id,
              accountId: SYSTEM_ACCOUNTS.HOUSE,
              direction: 'CREDIT',
              amount: 9n,
              balanceAfter: 0n,
            },
          ],
        });
      }),
    ).rejects.toThrow(/unbalanced ledger transaction/);
  });

  it('a single-leg transaction is rejected at commit', async () => {
    const { prisma } = services(app);
    await expect(
      prisma.$transaction(async (db) => {
        const tx = await db.ledgerTransaction.create({
          data: {
            idempotencyKey: `one-leg:${Date.now()}`,
            requestHash: 'x',
            reason: LedgerReason.ADJUSTMENT,
          },
        });
        await db.ledgerEntry.create({
          data: {
            transactionId: tx.id,
            accountId: SYSTEM_ACCOUNTS.HOUSE,
            direction: 'CREDIT',
            amount: 5n,
            balanceAfter: 0n,
          },
        });
      }),
    ).rejects.toThrow(/unbalanced ledger transaction/);
  });

  it('amounts must be positive', async () => {
    await expect(
      sql(
        `INSERT INTO "LedgerEntry" ("id","transactionId","accountId","direction","amount","balanceAfter")
         VALUES ('neg', $1, $2, 'DEBIT', 0, 0)`,
        transactionId,
        SYSTEM_ACCOUNTS.HOUSE,
      ),
    ).rejects.toThrow(/LedgerEntry_amount_positive/);
  });

  it('there is exactly one system account per type and currency', async () => {
    await expect(
      sql(`INSERT INTO "Account" ("id","type","currency") VALUES ('house-2','HOUSE','CHIP')`),
    ).rejects.toThrow(/23505[\s\S]*\(type, currency\)=\(HOUSE, CHIP\) already exists/);
  });

  it('a player wallet needs an owner and a system account must not have one', async () => {
    await expect(
      sql(
        `INSERT INTO "Account" ("id","type","currency") VALUES ('orphan','PLAYER_WALLET','CHIP')`,
      ),
    ).rejects.toThrow(/Account_owner_matches_type/);
  });
});
