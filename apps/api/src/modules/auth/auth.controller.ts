import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { REFRESH_COOKIE_NAME, type AuthResponseDto } from '@casino/shared';
import type { CookieOptions, Request, Response } from 'express';
import { CredentialRoute } from '../../common/rate-limit/rate-limit';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Public } from './auth.decorators';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService, type Session } from './auth.service';

/** The cookie is only ever sent to `/auth/*`, never to game or wallet routes. */
const COOKIE_PATH = '/auth';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @CredentialRoute()
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(res, await this.authService.register(dto));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @CredentialRoute()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(res, await this.authService.login(dto));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    try {
      return this.respond(res, await this.authService.refresh(this.cookieOf(req)));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(this.cookieOf(req));
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private respond(res: Response, session: Session): AuthResponseDto {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken.token, {
      ...this.cookieOptions(),
      expires: session.refreshToken.expiresAt,
    });
    res.setHeader('Cache-Control', 'no-store');
    return session.body;
  }

  private cookieOf(req: Request): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' ? value : undefined;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: this.config.auth.cookieSameSite,
      path: COOKIE_PATH,
    };
  }
}
