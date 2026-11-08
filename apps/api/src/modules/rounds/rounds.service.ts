import { HttpStatus, Injectable } from '@nestjs/common';
import { type GameRound, type GameType, Prisma, RoundStatus } from '@prisma/client';
import type { RoundSummaryDto } from '@casino/shared';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../infra/prisma/prisma.service';

export class RoundNotFoundError extends DomainError {
  readonly code = 'ROUND_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  constructor() {
    super('Round not found');
  }
}

/** A stored engine event (JSON-safe payload). */
export interface StoredEvent {
  seq: number;
  type: string;
  payload: unknown;
}

export interface CreateRoundInput {
  userId: string;
  game: GameType;
  rulesVersion: string;
  bet: bigint;
  seedPairId: string;
  nonce: number;
  idempotencyKey: string;
  requestHash: string;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Owner of `GameRound` and `RoundEvent`. Game-agnostic: it stores events and summaries, the
 * games decide what they mean. Writes take the caller's transaction client so a round, its
 * events and the chips it moves commit together.
 */
@Injectable()
export class RoundsService {
  constructor(private readonly prisma: PrismaService) {}

  create(db: Prisma.TransactionClient, input: CreateRoundInput): Promise<GameRound> {
    return db.gameRound.create({
      data: { ...input, totalBet: input.bet, status: RoundStatus.IN_PROGRESS },
    });
  }

  /** Locks the round row for the rest of the transaction (serialises actions on it). */
  async lockOwned(db: Prisma.TransactionClient, roundId: string, userId: string) {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "GameRound" WHERE "id" = ${roundId} AND "userId" = ${userId} FOR UPDATE`;
    if (rows.length === 0) throw new RoundNotFoundError();
    return db.gameRound.findUniqueOrThrow({ where: { id: roundId } });
  }

  /**
   * Appends events that must continue exactly at `fromVersion`, and moves the version forward.
   * The unique (roundId, seq) index rejects any concurrent writer that slipped through.
   */
  async appendEvents(
    db: Prisma.TransactionClient,
    roundId: string,
    fromVersion: number,
    events: readonly StoredEvent[],
    summary: { totalBet: bigint; payout?: bigint | null },
  ): Promise<GameRound> {
    events.forEach((e, i) => {
      if (e.seq !== fromVersion + i) throw new Error(`event seq ${e.seq} != ${fromVersion + i}`);
    });
    await db.roundEvent.createMany({
      data: events.map((e) => ({
        roundId,
        seq: e.seq,
        type: e.type,
        payload: e.payload as Prisma.InputJsonValue,
      })),
    });
    const settled = summary.payout !== undefined && summary.payout !== null;
    return db.gameRound.update({
      where: { id: roundId, version: fromVersion },
      data: {
        version: fromVersion + events.length,
        totalBet: summary.totalBet,
        ...(settled
          ? { status: RoundStatus.SETTLED, payout: summary.payout, settledAt: new Date() }
          : {}),
      },
    });
  }

  async events(roundId: string, db: Db = this.prisma): Promise<StoredEvent[]> {
    const rows = await db.roundEvent.findMany({
      where: { roundId },
      orderBy: { seq: 'asc' },
      select: { seq: true, type: true, payload: true },
    });
    return rows;
  }

  findByKey(userId: string, idempotencyKey: string): Promise<GameRound | null> {
    return this.prisma.gameRound.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
  }

  findOpen(userId: string, game: GameType): Promise<GameRound | null> {
    return this.prisma.gameRound.findFirst({
      where: { userId, game, status: { in: [RoundStatus.CREATED, RoundStatus.IN_PROGRESS] } },
    });
  }

  async getOwned(roundId: string, userId: string): Promise<GameRound> {
    const round = await this.prisma.gameRound.findFirst({ where: { id: roundId, userId } });
    if (!round) throw new RoundNotFoundError();
    return round;
  }

  async hasOpenRound(db: Db, seedPairId: string): Promise<boolean> {
    const count = await db.gameRound.count({
      where: { seedPairId, status: { in: [RoundStatus.CREATED, RoundStatus.IN_PROGRESS] } },
    });
    return count > 0;
  }

  /** Newest first, cursor-paginated by round id. */
  async list(userId: string, options: { cursor?: string; limit: number }) {
    const rows = await this.prisma.gameRound.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, options.limit);
    return {
      rounds: page.map(toRoundSummary),
      nextCursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

export function toRoundSummary(round: GameRound): RoundSummaryDto {
  return {
    id: round.id,
    game: round.game,
    status: round.status,
    rulesVersion: round.rulesVersion,
    bet: round.bet.toString(),
    totalBet: round.totalBet.toString(),
    payout: round.payout?.toString() ?? null,
    nonce: round.nonce,
    createdAt: round.createdAt.toISOString(),
    settledAt: round.settledAt?.toISOString() ?? null,
  };
}
