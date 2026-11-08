import { LedgerReason } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config/app-config';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { InvalidTransferError } from './wallet.errors';
import { WalletService } from './wallet.service';
import type { TransferCommand } from './wallet.types';

/** Input validation happens before any database access (concurrency is covered in test/). */
describe('WalletService.transfer input validation', () => {
  const prisma = { ledgerTransaction: { findUnique: vi.fn() } };
  const wallet = new WalletService(
    prisma as unknown as PrismaService,
    loadConfig({ DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(32) }),
  );
  const valid: TransferCommand = {
    idempotencyKey: 'k',
    reason: LedgerReason.BET,
    fromAccountId: 'a',
    toAccountId: 'b',
    amount: 1n,
  };

  it.each([
    ['zero amount', { amount: 0n }],
    ['negative amount', { amount: -5n }],
    ['non-bigint amount', { amount: 5 as unknown as bigint }],
    ['same account', { toAccountId: 'a' }],
    ['empty key', { idempotencyKey: '' }],
    ['oversized key', { idempotencyKey: 'k'.repeat(201) }],
  ])('rejects %s', async (_label, patch) => {
    await expect(wallet.transfer({ ...valid, ...patch })).rejects.toBeInstanceOf(
      InvalidTransferError,
    );
    expect(prisma.ledgerTransaction.findUnique).not.toHaveBeenCalled();
  });
});
