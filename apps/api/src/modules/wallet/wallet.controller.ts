import { Controller, Get, Query } from '@nestjs/common';
import type { LedgerHistoryDto, ReconciliationReportDto, WalletBalanceDto } from '@casino/shared';
import { type AuthenticatedUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { ReconciliationService } from './reconciliation.service';
import { HistoryQueryDto, toBalanceDto, toHistoryDto, toReconciliationDto } from './wallet.dto';
import { WalletService } from './wallet.service';

/**
 * Read-only for players: chips only move as a side effect of game operations (phase 2+),
 * never through a "transfer" endpoint.
 */
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Get()
  async balance(@CurrentUser() user: AuthenticatedUser): Promise<WalletBalanceDto> {
    return toBalanceDto(await this.walletService.getPlayerAccount(user.sub));
  }

  @Get('history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HistoryQueryDto,
  ): Promise<LedgerHistoryDto> {
    return toHistoryDto(
      await this.walletService.getHistory(user.sub, { cursor: query.cursor, limit: query.limit }),
    );
  }

  /** Full ledger ↔ balance reconciliation. Admin only. */
  @Get('reconciliation')
  @Roles('ADMIN')
  async reconciliation(): Promise<ReconciliationReportDto> {
    return toReconciliationDto(await this.reconciliationService.reconcile());
  }
}
