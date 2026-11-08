import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaService } from '../../infra/prisma/prisma.service';

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;
  constructor() {
    super('Session expired, please log in again');
  }
}

export interface IssuedRefreshToken {
  /** `<id>.<secret>`: what goes in the cookie. Never stored. */
  token: string;
  expiresAt: Date;
}

/**
 * Opaque refresh tokens with rotation and reuse detection.
 *
 * - Only SHA-256(secret) is stored, so a database leak does not leak usable tokens.
 * - Each refresh revokes the presented token and issues a new one in the same family.
 * - Presenting a token that was already rotated means it was copied (or replayed): the whole
 *   family is revoked and the user must log in again. A short grace window tolerates two tabs
 *   refreshing at the same time with the same cookie.
 */
@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  issue(userId: string, familyId: string = randomUUID()): Promise<IssuedRefreshToken> {
    return this.create(this.prisma, userId, familyId);
  }

  /** Validates and rotates a token. Returns the owner and the replacement token. */
  async rotate(presented: string): Promise<{ userId: string; next: IssuedRefreshToken }> {
    const stored = await this.findValidShape(presented);
    const now = new Date();
    if (stored.expiresAt <= now) throw new InvalidRefreshTokenError();

    if (stored.revokedAt) {
      const ageMs = now.getTime() - stored.revokedAt.getTime();
      const withinGrace =
        stored.replacedById !== null && ageMs <= this.config.auth.refreshReuseGraceSeconds * 1000;
      if (!withinGrace) {
        await this.revokeFamily(stored.familyId);
        this.logger.warn(
          { userId: stored.userId, familyId: stored.familyId },
          'refresh token reuse detected: session family revoked',
        );
        throw new InvalidRefreshTokenError();
      }
      // A racing request already rotated it moments ago: issue a sibling in the same family.
      return { userId: stored.userId, next: await this.issue(stored.userId, stored.familyId) };
    }

    return this.prisma.$transaction(async (db) => {
      const next = await this.create(db, stored.userId, stored.familyId);
      // Conditional update: only one concurrent request can win the rotation.
      const { count } = await db.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now, replacedById: next.id },
      });
      if (count === 0) {
        // Revoked between our read and now. Keep the new token only if it was a concurrent
        // rotation (racing tab); a logout or family revocation must win (throwing rolls back).
        const current = await db.refreshToken.findUniqueOrThrow({ where: { id: stored.id } });
        if (current.replacedById === null) throw new InvalidRefreshTokenError();
      }
      return { userId: stored.userId, next };
    });
  }

  /** Logout: revokes the session (token family) the presented token belongs to. */
  async revoke(presented: string | undefined): Promise<void> {
    if (!presented) return;
    const stored = await this.findValidShape(presented).catch(() => null);
    if (stored) await this.revokeFamily(stored.familyId);
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findValidShape(presented: string) {
    const [id, secret] = presented.split('.');
    if (!id || !secret) throw new InvalidRefreshTokenError();
    const stored = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!stored) throw new InvalidRefreshTokenError();
    const expected = Buffer.from(stored.tokenHash, 'hex');
    const actual = sha256(secret);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new InvalidRefreshTokenError();
    }
    return stored;
  }

  private async create(
    db: Pick<PrismaService, 'refreshToken'>,
    userId: string,
    familyId: string,
  ): Promise<IssuedRefreshToken & { id: string }> {
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.auth.refreshTokenTtlDays * 86_400_000);
    const row = await db.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(secret).toString('hex'), expiresAt },
    });
    return { id: row.id, token: `${row.id}.${secret}`, expiresAt };
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
