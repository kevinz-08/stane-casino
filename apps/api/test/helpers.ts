import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccountType, LedgerReason } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_CONFIG, type AppConfig, loadConfig } from '../src/config/app-config';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { ReconciliationService } from '../src/modules/wallet/reconciliation.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { SYSTEM_ACCOUNTS } from '../src/modules/wallet/wallet.types';

export { SYSTEM_ACCOUNTS };

/** Boots the real application (all modules, guards, pipes, filters) against the test DB. */
export async function createTestApp(
  overrideConfig?: (config: AppConfig) => AppConfig,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrideConfig) {
    builder.overrideProvider(APP_CONFIG).useValue(overrideConfig(loadConfig(process.env)));
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

export function services(app: INestApplication) {
  return {
    prisma: app.get(PrismaService),
    wallet: app.get(WalletService),
    reconciliation: app.get(ReconciliationService),
  };
}

export const uniqueEmail = () => `${randomUUID()}@test.local`;

/**
 * A user with an empty player wallet (no initial grant), optionally funded from the FAUCET.
 * Bypasses registration (no password hashing) to keep concurrency tests fast.
 */
export async function createPlayer(app: INestApplication, funds = 0n) {
  const { prisma, wallet } = services(app);
  const user = await prisma.user.create({
    data: { email: uniqueEmail(), passwordHash: 'unused', displayName: 'Test player' },
  });
  const account = await prisma.account.create({
    data: { userId: user.id, type: AccountType.PLAYER_WALLET },
  });
  if (funds > 0n) {
    await wallet.transfer({
      idempotencyKey: `test-fund:${account.id}`,
      reason: LedgerReason.ADJUSTMENT,
      fromAccountId: SYSTEM_ACCOUNTS.FAUCET,
      toAccountId: account.id,
      amount: funds,
    });
  }
  return { user, account };
}

export async function balanceOf(app: INestApplication, accountId: string): Promise<bigint> {
  const account = await services(app).prisma.account.findUniqueOrThrow({
    where: { id: accountId },
  });
  return account.balance;
}
