import { Module } from '@nestjs/common';
import { BlackjackController } from './blackjack.controller';
import { BlackjackService } from './blackjack.service';

// Orchestrates a blackjack round: wallet + fairness + game-engine + rounds.
// TODO(fase-2): wire dependencies and exports
@Module({
  controllers: [BlackjackController],
  providers: [BlackjackService],
  exports: [BlackjackService],
})
export class BlackjackModule {}
