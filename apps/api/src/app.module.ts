import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { RoundsModule } from './modules/rounds/rounds.module';
import { FairnessModule } from './modules/fairness/fairness.module';
import { BlackjackModule } from './modules/blackjack/blackjack.module';
import { SlotsModule } from './modules/slots/slots.module';
import { ResponsibleGamingModule } from './modules/responsible-gaming/responsible-gaming.module';
import { AdminModule } from './modules/admin/admin.module';
import { LobbyModule } from './modules/lobby/lobby.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    WalletModule,
    RoundsModule,
    FairnessModule,
    BlackjackModule,
    SlotsModule,
    ResponsibleGamingModule,
    AdminModule,
    LobbyModule,
    HealthModule,
  ],
})
export class AppModule {}
