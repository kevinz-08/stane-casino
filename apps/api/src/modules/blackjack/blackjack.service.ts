import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type GameRound, GameType, LedgerReason, Prisma } from '@prisma/client';
import {
  actionCost,
  allowedActions,
  applyAction,
  BLACKJACK_RULES_V1,
  type BlackjackAction,
  type BlackjackEvent,
  type BlackjackPlayerView,
  type BlackjackState,
  createHmacRng,
  IllegalActionError,
  init,
  redactEvents,
  replayEvents,
  toPlayerView,
} from '@casino/game-engine';
import {
  BLACKJACK_MAX_BET,
  BLACKJACK_MIN_BET,
  type ActiveBlackjackRoundDto,
  type BlackjackRoundDto,
} from '@casino/shared';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { isPrismaError, PrismaErrorCode, PrismaService } from '../../infra/prisma/prisma.service';
import { FairnessService, type RoundSeeds } from '../fairness/fairness.service';
import { ResponsibleGamingService } from '../responsible-gaming/responsible-gaming.service';
import { RoundsService, toRoundSummary } from '../rounds/rounds.service';
import { WalletService } from '../wallet/wallet.service';
import { SYSTEM_ACCOUNTS } from '../wallet/wallet.types';
import {
  IllegalMoveError,
  InvalidBetError,
  RoundInProgressError,
  RoundSettledError,
  RoundVersionMismatchError,
  StartKeyConflictError,
} from './blackjack.errors';

export type BlackjackRound = BlackjackRoundDto<BlackjackPlayerView, BlackjackEvent>;

/**
 * Orchestrates blackjack rounds (ARCHITECTURE.md, "Flujo de una apuesta"):
 *   canBet → nonce → stake debit → engine → events → payout
 * Each request is ONE PostgreSQL transaction spanning wallet, rounds and fairness, so a round
 * can never exist without its stake, or be settled without its payout.
 */
@Injectable()
export class BlackjackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly rounds: RoundsService,
    private readonly fairness: FairnessService,
    private readonly responsibleGaming: ResponsibleGamingService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async start(userId: string, bet: bigint, idempotencyKey: string): Promise<BlackjackRound> {
    validateBet(bet);
    const requestHash = createHash('sha256').update(`blackjack:start:${bet}`).digest('hex');

    const previous = await this.rounds.findByKey(userId, idempotencyKey);
    if (previous) return this.replayStart(previous, requestHash, userId);

    await this.responsibleGaming.assertCanBet({ userId, game: 'BLACKJACK', amount: bet });
    const account = await this.wallet.getPlayerAccount(userId);
    await this.fairness.ensureActivePair(userId);

    try {
      const round = await this.transaction(async (db) => {
        const seeds = await this.fairness.reserveNonce(db, userId);
        const created = await this.rounds.create(db, {
          userId,
          game: GameType.BLACKJACK,
          rulesVersion: BLACKJACK_RULES_V1.version,
          bet,
          seedPairId: seeds.seedPairId,
          nonce: seeds.nonce,
          idempotencyKey,
          requestHash,
        });
        await this.wallet.transferWithin(db, {
          idempotencyKey: `blackjack:${created.id}:stake`,
          reason: LedgerReason.BET,
          fromAccountId: account.id,
          toAccountId: SYSTEM_ACCOUNTS.HOUSE,
          amount: bet,
          roundId: created.id,
        });
        const step = init({ bet, rulesVersion: created.rulesVersion }, rngFor(seeds));
        return this.persistStep(db, created, account.id, step.state, step.events);
      });
      return this.toDto(round, userId);
    } catch (error) {
      if (!isPrismaError(error, PrismaErrorCode.UniqueViolation)) throw error;
      // Either a concurrent request with the same key won, or another round is open.
      const winner = await this.rounds.findByKey(userId, idempotencyKey);
      if (winner) return this.replayStart(winner, requestHash, userId);
      throw new RoundInProgressError();
    }
  }

  async act(
    userId: string,
    roundId: string,
    action: BlackjackAction,
    version: number,
  ): Promise<BlackjackRound> {
    const account = await this.wallet.getPlayerAccount(userId);
    const round = await this.transaction(async (db) => {
      const current = await this.rounds.lockOwned(db, roundId, userId);
      if (current.status === 'SETTLED') throw new RoundSettledError();
      if (current.version !== version) {
        throw new RoundVersionMismatchError(version, current.version);
      }
      const state = replayEvents((await this.rounds.events(roundId, db)) as BlackjackEvent[]);

      if (!allowedActions(state).includes(action.type)) {
        throw new IllegalMoveError(`${action.type} is not allowed now`);
      }
      const cost = actionCost(state, action);
      if (cost > 0n) {
        await this.responsibleGaming.assertCanBet({ userId, game: 'BLACKJACK', amount: cost });
        await this.wallet.transferWithin(db, {
          // One key per decision point: the version identifies it uniquely within the round.
          idempotencyKey: `blackjack:${roundId}:v${version}:${action.type.toLowerCase()}`,
          reason: LedgerReason.BET,
          fromAccountId: account.id,
          toAccountId: SYSTEM_ACCOUNTS.HOUSE,
          amount: cost,
          roundId,
        });
      }

      const seeds = await this.fairness.seedsForRound(db, current);
      let step;
      try {
        step = applyAction(state, action, rngFor(seeds));
      } catch (error) {
        if (error instanceof IllegalActionError) throw new IllegalMoveError(error.message);
        throw error;
      }
      return this.persistStep(db, current, account.id, step.state, step.events);
    });
    return this.toDto(round, userId);
  }

  async getActive(userId: string): Promise<ActiveBlackjackRoundDto<BlackjackPlayerView>> {
    const open = await this.rounds.findOpen(userId, GameType.BLACKJACK);
    return { round: open ? await this.toDto(open, userId) : null };
  }

  /** Full round with its (redacted) event log and fairness data, for history and verification. */
  async get(userId: string, roundId: string): Promise<BlackjackRound> {
    const round = await this.rounds.getOwned(roundId, userId);
    return this.toDto(round, userId, { withEvents: true });
  }

  // ---------------------------------------------------------------------------------------

  private transaction<T>(fn: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: this.config.wallet.txMaxWaitMs,
      timeout: this.config.wallet.txTimeoutMs,
    });
  }

  /** Stores the new events and, if the round just ended, pays it out. */
  private async persistStep(
    db: Prisma.TransactionClient,
    round: GameRound,
    playerAccountId: string,
    state: BlackjackState,
    events: readonly BlackjackEvent[],
  ): Promise<GameRound> {
    const settled = state.phase === 'SETTLED';
    if (settled && (state.payout as bigint) > 0n) {
      await this.wallet.transferWithin(db, {
        idempotencyKey: `blackjack:${round.id}:payout`,
        reason: LedgerReason.PAYOUT,
        fromAccountId: SYSTEM_ACCOUNTS.HOUSE,
        toAccountId: playerAccountId,
        amount: state.payout as bigint,
        roundId: round.id,
      });
    }
    return this.rounds.appendEvents(db, round.id, round.version, events, {
      totalBet: state.totalBet,
      payout: settled ? state.payout : null,
    });
  }

  private async replayStart(round: GameRound, requestHash: string, userId: string) {
    if (round.requestHash !== requestHash) throw new StartKeyConflictError();
    return this.toDto(round, userId);
  }

  private async toDto(
    round: GameRound,
    userId: string,
    options: { withEvents?: boolean } = {},
  ): Promise<BlackjackRound> {
    const events = (await this.rounds.events(round.id)) as BlackjackEvent[];
    const state = replayEvents(events);
    const [fairness, account] = await Promise.all([
      this.fairness.publicFairness(round),
      this.wallet.getPlayerAccount(userId),
    ]);
    return {
      round: toRoundSummary(round),
      view: toPlayerView(state),
      fairness,
      ...(options.withEvents ? { events: redactEvents(events) } : {}),
      balance: account.balance.toString(),
    };
  }
}

function validateBet(bet: bigint): void {
  if (bet < BLACKJACK_MIN_BET || bet > BLACKJACK_MAX_BET || bet % 2n !== 0n) {
    throw new InvalidBetError(
      `bet must be an even number of chips between ${BLACKJACK_MIN_BET} and ${BLACKJACK_MAX_BET}`,
    );
  }
}

function rngFor(seeds: RoundSeeds) {
  return createHmacRng({
    serverSeed: seeds.serverSeed,
    clientSeed: seeds.clientSeed,
    nonce: seeds.nonce,
  });
}
