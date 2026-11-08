import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

// Double-entry immutable ledger, balances, idempotent transfers.
// TODO(fase-1): wire dependencies and exports
@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
