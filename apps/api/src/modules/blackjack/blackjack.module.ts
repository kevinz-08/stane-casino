import { Module } from '@nestjs/common';
import { FairnessModule } from '../fairness/fairness.module';
import { ResponsibleGamingModule } from '../responsible-gaming/responsible-gaming.module';
import { RoundsModule } from '../rounds/rounds.module';
import { WalletModule } from '../wallet/wallet.module';
import { BlackjackController } from './blackjack.controller';
import { BlackjackService } from './blackjack.service';

// Orchestrates single-player blackjack: responsible-gaming veto + fairness + wallet + engine +
// rounds, each request in one database transaction.
@Module({
  imports: [WalletModule, RoundsModule, FairnessModule, ResponsibleGamingModule],
  controllers: [BlackjackController],
  providers: [BlackjackService],
  exports: [BlackjackService],
})
export class BlackjackModule {}
