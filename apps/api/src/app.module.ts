import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingModule } from './common/logging/logging.module';
import { throttlerOptions } from './common/rate-limit/rate-limit';
import { createValidationPipe } from './common/validation/validation.pipe';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './modules/auth/guards';
import { BlackjackModule } from './modules/blackjack/blackjack.module';
import { FairnessModule } from './modules/fairness/fairness.module';
import { HealthModule } from './modules/health/health.module';
import { LobbyModule } from './modules/lobby/lobby.module';
import { ResponsibleGamingModule } from './modules/responsible-gaming/responsible-gaming.module';
import { RoundsModule } from './modules/rounds/rounds.module';
import { SlotsModule } from './modules/slots/slots.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => throttlerOptions(config),
    }),
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
  providers: [
    // Guards run in this order: rate limit → authentication → roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
