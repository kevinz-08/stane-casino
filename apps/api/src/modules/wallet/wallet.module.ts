import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

// Double-entry immutable ledger, balances, idempotent transfers, reconciliation.
// Sole writer of Account / LedgerTransaction / LedgerEntry.
@Module({
  controllers: [WalletController],
  providers: [WalletService, ReconciliationService],
  exports: [WalletService, ReconciliationService],
})
export class WalletModule {}
