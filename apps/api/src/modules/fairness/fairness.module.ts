import { Module } from '@nestjs/common';
import { FairnessController } from './fairness.controller';
import { FairnessService } from './fairness.service';

// Seed pairs: commit (hash), rotate, reveal and verification.
// TODO(fase-2): wire dependencies and exports
@Module({
  controllers: [FairnessController],
  providers: [FairnessService],
  exports: [FairnessService],
})
export class FairnessModule {}
