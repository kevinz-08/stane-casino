import { randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, SeedStatus, type SeedPair } from '@prisma/client';
import { commitServerSeed } from '@casino/game-engine';
import type { ActiveSeedPairDto, RevealedSeedPairDto, RoundFairnessDto } from '@casino/shared';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { isPrismaError, PrismaErrorCode, PrismaService } from '../../infra/prisma/prisma.service';
import { RoundsService } from '../rounds/rounds.service';
import { SeedCipher } from './seed-cipher';

export class RotationBlockedError extends DomainError {
  readonly code = 'ROUND_IN_PROGRESS';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('Finish the round in progress before rotating seeds: it would reveal its cards');
  }
}

/** Seeds of a round, for the game services only. Never sent to a client while ACTIVE. */
export interface RoundSeeds {
  seedPairId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Owner of `SeedPair` (ADR-003): commitment, nonce reservation, rotation and reveal.
 * Active server seeds are stored encrypted and only ever leave this service decrypted towards
 * a game service on the server side, or in plaintext after rotation.
 */
@Injectable()
export class FairnessService {
  private readonly cipher: SeedCipher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rounds: RoundsService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.cipher = new SeedCipher(config.fairness.seedEncryptionKey);
  }

  /** Returns the user's active pair, creating the first one if needed. */
  async ensureActivePair(userId: string): Promise<SeedPair> {
    const existing = await this.findActive(this.prisma, userId);
    if (existing) return existing;
    try {
      return await this.createPair(this.prisma, userId, randomClientSeed());
    } catch (error) {
      if (!isPrismaError(error, PrismaErrorCode.UniqueViolation)) throw error;
      return (await this.findActive(this.prisma, userId)) as SeedPair; // created concurrently
    }
  }

  /**
   * Atomically takes the next nonce of the active pair (inside the round's transaction, so a
   * failed round gives the nonce back). The row lock also serialises rounds of one player.
   */
  async reserveNonce(db: Prisma.TransactionClient, userId: string): Promise<RoundSeeds> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows = await db.$queryRaw<
        Array<
          Pick<SeedPair, 'id' | 'serverSeed' | 'serverSeedHash' | 'clientSeed'> & { nonce: number }
        >
      >`
        UPDATE "SeedPair" SET "nextNonce" = "nextNonce" + 1
        WHERE "userId" = ${userId} AND "status" = 'ACTIVE'
        RETURNING "id", "serverSeed", "serverSeedHash", "clientSeed", "nextNonce" - 1 AS "nonce"`;
      const row = rows[0];
      if (row) {
        return {
          seedPairId: row.id,
          serverSeed: this.cipher.decrypt(row.serverSeed, row.id),
          serverSeedHash: row.serverSeedHash,
          clientSeed: row.clientSeed,
          nonce: row.nonce,
        };
      }
      // No active pair (first round ever): create it outside this transaction and retry.
      await this.ensureActivePair(userId);
    }
    throw new Error(`no active seed pair for user ${userId}`);
  }

  /** Seeds of an existing round, to resume it. */
  async seedsForRound(db: Db, round: { seedPairId: string; nonce: number }): Promise<RoundSeeds> {
    const pair = await db.seedPair.findUniqueOrThrow({ where: { id: round.seedPairId } });
    return {
      seedPairId: pair.id,
      serverSeed: this.plaintextSeed(pair),
      serverSeedHash: pair.serverSeedHash,
      clientSeed: pair.clientSeed,
      nonce: round.nonce,
    };
  }

  /** What the player may know about a round's seeds (the server seed only once revealed). */
  async publicFairness(round: { seedPairId: string; nonce: number }): Promise<RoundFairnessDto> {
    const pair = await this.prisma.seedPair.findUniqueOrThrow({ where: { id: round.seedPairId } });
    return {
      seedPairId: pair.id,
      serverSeedHash: pair.serverSeedHash,
      clientSeed: pair.clientSeed,
      nonce: round.nonce,
      serverSeed: pair.status === SeedStatus.REVEALED ? pair.serverSeed : null,
    };
  }

  async listPairs(
    userId: string,
  ): Promise<{ active: ActiveSeedPairDto; revealed: RevealedSeedPairDto[] }> {
    const active = await this.ensureActivePair(userId);
    const revealed = await this.prisma.seedPair.findMany({
      where: { userId, status: SeedStatus.REVEALED },
      orderBy: { revealedAt: 'desc' },
      take: 50,
    });
    return { active: toActiveDto(active), revealed: revealed.map(toRevealedDto) };
  }

  /**
   * Reveals the active server seed and starts a new pair (with the player's new client seed,
   * if given). Refused while a round of the active pair is unfinished: revealing the seed would
   * reveal that round's hole card and next cards.
   */
  async rotate(
    userId: string,
    clientSeed?: string,
  ): Promise<{ revealed: RevealedSeedPairDto; active: ActiveSeedPairDto }> {
    await this.ensureActivePair(userId);
    return this.prisma.$transaction(async (db) => {
      const [locked] = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SeedPair" WHERE "userId" = ${userId} AND "status" = 'ACTIVE' FOR UPDATE`;
      if (!locked) throw new Error('active seed pair disappeared during rotation');
      if (await this.rounds.hasOpenRound(db, locked.id)) throw new RotationBlockedError();

      const current = await db.seedPair.findUniqueOrThrow({ where: { id: locked.id } });
      const revealed = await db.seedPair.update({
        where: { id: current.id },
        data: {
          status: SeedStatus.REVEALED,
          revealedAt: new Date(),
          serverSeed: this.cipher.decrypt(current.serverSeed, current.id),
        },
      });
      const next = await this.createPair(db, userId, clientSeed ?? randomClientSeed());
      return { revealed: toRevealedDto(revealed), active: toActiveDto(next) };
    });
  }

  private findActive(db: Db, userId: string) {
    return db.seedPair.findFirst({ where: { userId, status: SeedStatus.ACTIVE } });
  }

  private async createPair(db: Db, userId: string, clientSeed: string): Promise<SeedPair> {
    const serverSeed = randomBytes(32).toString('hex');
    // The id is chosen up front because the ciphertext is bound to it (AAD): one single insert.
    const id = `sp_${randomUUID().replaceAll('-', '')}`;
    return db.seedPair.create({
      data: {
        id,
        userId,
        clientSeed,
        serverSeedHash: commitServerSeed(serverSeed),
        serverSeed: this.cipher.encrypt(serverSeed, id),
      },
    });
  }

  private plaintextSeed(pair: SeedPair): string {
    return pair.status === SeedStatus.REVEALED
      ? pair.serverSeed
      : this.cipher.decrypt(pair.serverSeed, pair.id);
  }
}

function randomClientSeed(): string {
  return randomBytes(8).toString('hex');
}

function toActiveDto(pair: SeedPair): ActiveSeedPairDto {
  return {
    id: pair.id,
    serverSeedHash: pair.serverSeedHash,
    clientSeed: pair.clientSeed,
    nextNonce: pair.nextNonce,
    createdAt: pair.createdAt.toISOString(),
  };
}

function toRevealedDto(pair: SeedPair): RevealedSeedPairDto {
  return {
    id: pair.id,
    serverSeed: pair.serverSeed,
    serverSeedHash: pair.serverSeedHash,
    clientSeed: pair.clientSeed,
    nextNonce: pair.nextNonce,
    createdAt: pair.createdAt.toISOString(),
    revealedAt: (pair.revealedAt as Date).toISOString(),
  };
}
