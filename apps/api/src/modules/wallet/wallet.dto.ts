import type { LedgerHistoryDto, ReconciliationReportDto, WalletBalanceDto } from '@casino/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ReconciliationReport } from './reconciliation.service';
import type { HistoryPage, PlayerAccount } from './wallet.types';

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export function toBalanceDto(account: PlayerAccount): WalletBalanceDto {
  return {
    accountId: account.id,
    currency: account.currency,
    balance: account.balance.toString(),
  };
}

export function toHistoryDto(page: HistoryPage): LedgerHistoryDto {
  return {
    entries: page.entries.map((e) => ({
      id: e.id,
      transactionId: e.transactionId,
      direction: e.direction,
      reason: e.reason,
      amount: e.amount.toString(),
      balanceAfter: e.balanceAfter.toString(),
      roundId: e.roundId,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor: page.nextCursor,
  };
}

export function toReconciliationDto(report: ReconciliationReport): ReconciliationReportDto {
  return {
    checkedAt: report.checkedAt.toISOString(),
    accountsChecked: report.accountsChecked,
    transactionsChecked: report.transactionsChecked,
    totalDebits: report.totalDebits.toString(),
    totalCredits: report.totalCredits.toString(),
    mismatches: report.mismatches.map((m) => ({
      accountId: m.accountId,
      cachedBalance: m.cachedBalance.toString(),
      ledgerBalance: m.ledgerBalance.toString(),
    })),
    unbalancedTransactionIds: report.unbalancedTransactionIds,
    ok: report.ok,
  };
}
