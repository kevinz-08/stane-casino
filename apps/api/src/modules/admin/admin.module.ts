import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// Back-office: user lookup, ledger audit, round inspector, game config.
// TODO(fase-5): wire dependencies and exports
@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
