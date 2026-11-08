import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { AuthResponseDto } from '@casino/shared';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import type { LoginDto, RegisterDto } from './auth.dto';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import { type IssuedRefreshToken, RefreshTokensService } from './refresh-tokens.service';

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;
  constructor() {
    super('Invalid e-mail or password');
  }
}

export interface Session {
  body: AuthResponseDto;
  refreshToken: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly wallet: WalletService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto): Promise<Session> {
    const passwordHash = await hashPassword(dto.password, this.config.auth.passwordHashLogN);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    });
    await this.wallet.openPlayerWallet(user.id);
    return this.startSession(user);
  }

  async login(dto: LoginDto): Promise<Session> {
    const user = await this.users.findByEmail(dto.email);
    // Always run scrypt, even for unknown e-mails, so timing does not reveal which exist.
    const hash = user?.passwordHash ?? (await getDummyHash(this.config.auth.passwordHashLogN));
    const valid = await verifyPassword(dto.password, hash);
    if (!user || !valid) throw new InvalidCredentialsError();
    // Idempotent; repairs a registration that failed between creating the user and the wallet.
    await this.wallet.openPlayerWallet(user.id);
    return this.startSession(user);
  }

  async refresh(presentedToken: string | undefined): Promise<Session> {
    const { userId, next } = await this.refreshTokens.rotate(presentedToken ?? '');
    const user = await this.users.getById(userId);
    return { body: await this.accessFor(user), refreshToken: next };
  }

  logout(presentedToken: string | undefined): Promise<void> {
    return this.refreshTokens.revoke(presentedToken);
  }

  private async startSession(user: User): Promise<Session> {
    return {
      body: await this.accessFor(user),
      refreshToken: await this.refreshTokens.issue(user.id),
    };
  }

  private async accessFor(user: User): Promise<AuthResponseDto> {
    const expiresIn = this.config.auth.accessTokenTtlSeconds;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.config.auth.jwtAccessSecret, expiresIn, algorithm: 'HS256' },
    );
    return { accessToken, expiresIn, user: UsersService.toDto(user) };
  }
}
