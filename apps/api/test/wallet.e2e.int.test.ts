import type { INestApplication } from '@nestjs/common';
import { INITIAL_CHIP_GRANT } from '@casino/shared';
import { LedgerReason } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toReconciliationDto } from '../src/modules/wallet/wallet.dto';
import { createTestApp, services, SYSTEM_ACCOUNTS, uniqueEmail } from './helpers';

describe('wallet (HTTP end-to-end)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app?.close();
  });

  async function signUp() {
    const email = uniqueEmail();
    const res = await http
      .post('/auth/register')
      .send({ email, password: 'a long enough password', displayName: 'Bob' })
      .expect(201);
    return {
      email,
      userId: res.body.user.id as string,
      auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
    };
  }

  it('new players get exactly one initial grant, even if login retries it', async () => {
    const { email, auth } = await signUp();
    await http.post('/auth/login').send({ email, password: 'a long enough password' }).expect(200);

    const history = await http.get('/wallet/history').set(auth).expect(200);
    expect(history.body.entries).toHaveLength(1);
    expect(history.body.entries[0]).toMatchObject({
      direction: 'CREDIT',
      reason: 'INITIAL_GRANT',
      amount: INITIAL_CHIP_GRANT.toString(),
      balanceAfter: INITIAL_CHIP_GRANT.toString(),
      roundId: null,
    });
    expect(history.body.nextCursor).toBeNull();
  });

  it('history is newest first and cursor-paginated', async () => {
    const { userId, auth } = await signUp();
    const { wallet } = services(app);
    const account = await wallet.getPlayerAccount(userId);
    for (let i = 1; i <= 5; i++) {
      await wallet.transfer({
        idempotencyKey: `history:${account.id}:${i}`,
        reason: LedgerReason.BET,
        fromAccountId: account.id,
        toAccountId: SYSTEM_ACCOUNTS.HOUSE,
        amount: BigInt(i),
      });
    }

    const page1 = await http.get('/wallet/history?limit=4').set(auth).expect(200);
    expect(page1.body.entries.map((e: { amount: string }) => e.amount)).toEqual([
      '5',
      '4',
      '3',
      '2',
    ]);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    const page2 = await http
      .get(`/wallet/history?limit=4&cursor=${page1.body.nextCursor as string}`)
      .set(auth)
      .expect(200);
    expect(page2.body.entries.map((e: { reason: string }) => e.reason)).toEqual([
      'BET',
      'INITIAL_GRANT',
    ]);
    expect(page2.body.nextCursor).toBeNull();

    const balance = await http.get('/wallet').set(auth).expect(200);
    expect(balance.body.balance).toBe((INITIAL_CHIP_GRANT - 15n).toString());
  });

  it('rejects an invalid page size', async () => {
    const { auth } = await signUp();
    const res = await http.get('/wallet/history?limit=1000').set(auth).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('reconciliation is admin-only and reports a consistent ledger', async () => {
    const player = await signUp();
    await http.get('/wallet/reconciliation').set(player.auth).expect(403);

    const admin = await signUp();
    await services(app).prisma.user.update({
      where: { id: admin.userId },
      data: { role: 'ADMIN' },
    });
    const login = await http
      .post('/auth/login')
      .send({ email: admin.email, password: 'a long enough password' })
      .expect(200);

    const res = await http
      .get('/wallet/reconciliation')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, mismatches: [], unbalancedTransactionIds: [] });
    expect(res.body.totalDebits).toBe(res.body.totalCredits);
    expect(res.body.accountsChecked).toBeGreaterThanOrEqual(2);
  });

  // Same file as the global reconciliation check above, so the two never overlap in time.
  it('reconciliation detects a cached balance that was tampered with', async () => {
    const { prisma, reconciliation } = services(app);
    const { userId } = await signUp();
    const account = await services(app).wallet.getPlayerAccount(userId);
    expect(await reconciliation.reconcile([])).toMatchObject({ ok: true, accountsChecked: 0 });

    await prisma.$executeRaw`UPDATE "Account" SET "balance" = "balance" + 1 WHERE "id" = ${account.id}`;
    try {
      const report = await reconciliation.reconcile([account.id]);
      expect(report.ok).toBe(false);
      expect(report.mismatches).toEqual([
        {
          accountId: account.id,
          cachedBalance: INITIAL_CHIP_GRANT + 1n,
          ledgerBalance: INITIAL_CHIP_GRANT,
        },
      ]);
      expect(toReconciliationDto(report).mismatches[0]).toEqual({
        accountId: account.id,
        cachedBalance: (INITIAL_CHIP_GRANT + 1n).toString(),
        ledgerBalance: INITIAL_CHIP_GRANT.toString(),
      });
    } finally {
      await prisma.$executeRaw`UPDATE "Account" SET "balance" = "balance" - 1 WHERE "id" = ${account.id}`;
    }
    expect((await reconciliation.reconcile([account.id])).ok).toBe(true);
  });

  it('a wallet that does not exist yields 404, not a crash', async () => {
    const { prisma } = services(app);
    const user = await prisma.user.create({
      data: { email: uniqueEmail(), passwordHash: 'x', displayName: 'No wallet' },
    });
    await expect(services(app).wallet.getPlayerAccount(user.id)).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
    });
  });
});
