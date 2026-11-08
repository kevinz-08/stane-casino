import { Module } from '@nestjs/common';
import { ResponsibleGamingController } from './responsible-gaming.controller';
import { ResponsibleGamingService } from './responsible-gaming.service';

// Bet veto (`canBet`) used by every game. Limits, cool-off and self-exclusion: phase 5a.
@Module({
  controllers: [ResponsibleGamingController],
  providers: [ResponsibleGamingService],
  exports: [ResponsibleGamingService],
})
export class ResponsibleGamingModule {}
