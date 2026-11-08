import { Module } from '@nestjs/common';
import { RoundsModule } from '../rounds/rounds.module';
import { FairnessController } from './fairness.controller';
import { FairnessService } from './fairness.service';

// Seed pairs: commitment (hash), nonce reservation, rotation and reveal. Owner of `SeedPair`.
@Module({
  imports: [RoundsModule],
  controllers: [FairnessController],
  providers: [FairnessService],
  exports: [FairnessService],
})
export class FairnessModule {}
