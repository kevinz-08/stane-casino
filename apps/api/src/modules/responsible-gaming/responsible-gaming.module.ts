import { Module } from '@nestjs/common';
import { ResponsibleGamingController } from './responsible-gaming.controller';
import { ResponsibleGamingService } from './responsible-gaming.service';

// Deposit/loss/time limits, cool-off and self-exclusion.
// TODO(fase-5): wire dependencies and exports
@Module({
  controllers: [ResponsibleGamingController],
  providers: [ResponsibleGamingService],
  exports: [ResponsibleGamingService],
})
export class ResponsibleGamingModule {}
