import type { INestApplication } from '@nestjs/common';
import { LedgerReason } from '@prisma/client';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsufficientFundsError, InvalidTransferError } from '../src/modules/wallet/wallet.errors';
import type { TransferCommand } from '../src/modules/wallet/wallet.types';
import { balanceOf, createPlayer, createTestApp, services, SYSTEM_ACCOUNTS } from './helpers';

const PLAYERS = 3;
const HOUSE = PLAYERS; // index of the house in an operation

const operation = fc.record({
  from: fc.integer({ min: 0, max: PLAYERS }),
  to: fc.integer({ min: 0, max: PLAYERS }),
  amount: fc.bigInt({ min: 1n, max: 300n }),
  /** When set, repeat an earlier operation verbatim (same idempotency key). */
  repeat: fc.option(fc.nat(), { nil: undefined }),
});

const scenario = fc.record({
  funds: fc.array(fc.bigInt({ min: 0n, max: 500n }), { minLength: PLAYERS, maxLength: PLAYERS }),
  ops: fc.array(operation, { maxLength: 25 }),
});

describe('ledger properties (fast-check, real PostgreSQL)', () => {
  let app: INestApplication;
  let run = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function setUp(funds: bigint[]) {
    const players = await Promise.all(funds.map((f) => createPlayer(app, f)));
    const ids = [...players.map((p) => p.account.id), SYSTEM_ACCOUNTS.HOUSE];
    return { ids, playerIds: ids.slice(0, PLAYERS), runId: ++run };
  }

  it('sequential operations match a reference model; ΣDEBIT = ΣCREDIT; balance = Σ entries', async () => {
    const { wallet, reconciliation } = services(app);

    await fc.assert(
      fc.asyncProperty(scenario, async ({ funds, ops }) => {
        const { ids, playerIds, runId } = await setUp(funds);
        const model = [...funds];
        const issued: TransferCommand[] = [];
        const committed = new Set<string>();

        for (const [i, op] of ops.entries()) {
          const command: TransferCommand =
            op.repeat !== undefined && issued.length > 0
              ? (issued[op.repeat % issued.length] as TransferCommand)
              : {
                  idempotencyKey: `prop:${runId}:${i}:${ids[0]}`,
                  reason: LedgerReason.ADJUSTMENT,
                  fromAccountId: ids[op.from] as string,
                  toAccountId: ids[op.to] as string,
                  amount: op.amount,
                };
          issued.push(command);

          const from = ids.indexOf(command.fromAccountId);
          const to = ids.indexOf(command.toAccountId);
          const attempt = wallet.transfer(command);

          if (from === to) {
            await expect(attempt).rejects.toBeInstanceOf(InvalidTransferError);
          } else if (committed.has(command.idempotencyKey)) {
            expect((await attempt).replayed).toBe(true); // no state change
          } else if (from !== HOUSE && (model[from] as bigint) < command.amount) {
            await expect(attempt).rejects.toBeInstanceOf(InsufficientFundsError);
          } else {
            expect((await attempt).replayed).toBe(false);
            committed.add(command.idempotencyKey);
            if (from !== HOUSE) model[from] = (model[from] as bigint) - command.amount;
            if (to !== HOUSE) model[to] = (model[to] as bigint) + command.amount;
          }
        }

        for (const [i, id] of playerIds.entries()) {
          expect(await balanceOf(app, id)).toBe(model[i]);
        }
        const report = await reconciliation.reconcile(playerIds);
        expect(report.mismatches).toEqual([]);
        expect(report.unbalancedTransactionIds).toEqual([]);
        expect(report.totalDebits).toBe(report.totalCredits);
      }),
      { numRuns: 15 },
    );
  });

  it('concurrent operations conserve chips and never overdraw a wallet', async () => {
    const { wallet, reconciliation } = services(app);
    const playerOnly = fc.record({
      from: fc.integer({ min: 0, max: PLAYERS - 1 }),
      to: fc.integer({ min: 0, max: PLAYERS - 1 }),
      amount: fc.bigInt({ min: 1n, max: 300n }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.bigInt({ min: 0n, max: 500n }), { minLength: PLAYERS, maxLength: PLAYERS }),
        fc.array(playerOnly, { minLength: 1, maxLength: 30 }),
        async (funds, ops) => {
          const { playerIds, runId } = await setUp(funds);
          await Promise.allSettled(
            ops.map((op, i) =>
              wallet.transfer({
                idempotencyKey: `prop-conc:${runId}:${i}:${playerIds[0]}`,
                reason: LedgerReason.ADJUSTMENT,
                fromAccountId: playerIds[op.from] as string,
                toAccountId: playerIds[op.to] as string,
                amount: op.amount,
              }),
            ),
          );

          const balances = await Promise.all(playerIds.map((id) => balanceOf(app, id)));
          for (const b of balances) expect(b >= 0n).toBe(true);
          const total = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);
          expect(total(balances)).toBe(total(funds));
          expect((await reconciliation.reconcile(playerIds)).ok).toBe(true);
        },
      ),
      { numRuns: 15 },
    );
  });
});
