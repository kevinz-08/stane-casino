import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, RolesGuard } from './guards';
import { RefreshTokensService } from './refresh-tokens.service';

// Registration, login, JWT access tokens, rotating refresh tokens, guards and roles.
// Owner of the `RefreshToken` table. The guards are registered globally in AppModule.
@Module({
  imports: [JwtModule.register({}), UsersModule, WalletModule],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokensService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
