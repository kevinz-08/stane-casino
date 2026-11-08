import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  type BlackjackEvent,
  type BlackjackPlayerView,
  replayEvents,
  toPlayerView,
  verifyBlackjackRound,
} from '@casino/game-engine';
import type { BlackjackRoundDto } from '@casino/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResponsibleGamingService } from '../src/modules/responsible-gaming/responsible-gaming.service';
import { createTestApp, services, uniqueEmail } from './helpers';

type Round = BlackjackRoundDto<BlackjackPlayerView, BlackjackEvent>;
type Auth = { Authorization: string };

describe('blackjack (HTTP end-to-end, real PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app?.close();
  });
  afterEach(() => vi.restoreAllMocks());

  async function signUp() {
    const res = await http
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: 'a long enough password', displayName: 'Bj' })
      .expect(201);
    return {
      userId: res.body.user.id as string,
      auth: { Authorization: `Bearer ${res.body.accessToken as string}` } as Auth,
    };
  }

  const start = (auth: Auth, bet = '10', key = `start-${randomUUID()}`) =>
    http.post('/blackjack/rounds').set(auth).set('Idempotency-Key', key).send({ bet });

  const act = (auth: Auth, round: Round, action: string, extra: object = {}) =>
    http
      .post(`/blackjack/rounds/${round.round.id}/actions`)
      .set(auth)
      .send({ action, version: round.view.version, ...extra });

  /** A simple legal policy: decline insurance, hit below 12, otherwise stand. */
  async function playToEnd(auth: Auth, round: Round): Promise<Round> {
    let current = round;
    while (current.view.phase !== 'SETTLED') {
      const hand = current.view.hands[current.view.activeHand];
      const res =
        current.view.phase === 'INSURANCE'
          ? await act(auth, current, 'INSURANCE', { take: false })
          : await act(auth, current, (hand?.total ?? 21) < 12 ? 'HIT' : 'STAND');
      expect(res.status).toBe(200);
      current = res.body as Round;
    }
    return current;
  }

  /** Starts rounds until one stays open (an initial blackjack settles at once). */
  async function startOpenRound(auth: Auth): Promise<Round> {
    for (let i = 0; i < 50; i++) {
      const res = await start(auth).expect(201);
      if (res.body.view.phase !== 'SETTLED') return res.body as Round;
    }
    throw new Error('could not get an open round');
  }

  async function balance(auth: Auth): Promise<bigint> {
    return BigInt((await http.get('/wallet').set(auth).expect(200)).body.balance as string);
  }

  it('a full round: stake debited, hole card hidden, payout credited, ledger and events agree', async () => {
    const { auth, userId } = await signUp();
    const before = await balance(auth);
    const open = await startOpenRound(auth);

    // Hidden information while the round is open.
    expect(open.view.dealer.cards[1]).toBeNull();
    expect(open.fairness.serverSeed).toBeNull();
    expect(open.fairness.serverSeedHash).toMatch(/^[0-9a-f]{64}$/);
    const detail = (await http.get(`/blackjack/rounds/${open.round.id}`).set(auth).expect(200))
      .body as Round;
    const hole = detail.events?.find(
      (e) => e.type === 'CARD_DEALT' && e.payload.to === 'DEALER' && e.payload.faceDown,
    );
    expect(hole?.payload).toMatchObject({ card: null });

    const done = await playToEnd(auth, open);
    expect(done.round.status).toBe('SETTLED');
    expect(done.view.dealer.holeRevealed).toBe(true);

    // Chip conservation across every round played by this user (some may have settled at once).
    const { prisma } = services(app);
    const rounds = await prisma.gameRound.findMany({ where: { userId } });
    const net = rounds.reduce((s, r) => s + (r.payout ?? 0n) - r.totalBet, 0n);
    expect(await balance(auth)).toBe(before + net);
    expect(BigInt(done.balance)).toBe(before + net);

    // The ledger of the round: stakes out == totalBet, credits in == payout.
    const legs = await prisma.ledgerEntry.findMany({
      where: { transaction: { roundId: done.round.id }, account: { type: 'PLAYER_WALLET' } },
    });
    const debits = legs.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amount, 0n);
    const credits = legs.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amount, 0n);
    expect(debits.toString()).toBe(done.round.totalBet);
    expect(credits.toString()).toBe(done.round.payout);

    // Replaying the stored events gives the stored summary and the view that was returned.
    const stored = await prisma.roundEvent.findMany({
      where: { roundId: done.round.id },
      orderBy: { seq: 'asc' },
    });
    const state = replayEvents(stored as unknown as BlackjackEvent[]);
    expect(state.totalBet.toString()).toBe(done.round.totalBet);
    expect(state.payout?.toString()).toBe(done.round.payout);
    expect(toPlayerView(state)).toEqual(done.view);
  });

  it('starting with the same Idempotency-Key 20 times in parallel bets once', async () => {
    const { auth, userId } = await signUp();
    const before = await balance(auth);
    const key = `parallel-${randomUUID()}`;
    const responses = await Promise.all(Array.from({ length: 20 }, () => start(auth, '20', key)));

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const ids = new Set(responses.map((r) => r.body.round.id as string));
    expect(ids.size).toBe(1);
    const { prisma } = services(app);
    expect(await prisma.gameRound.count({ where: { userId } })).toBe(1);
    const [round] = await prisma.gameRound.findMany({ where: { userId } });
    expect(await balance(auth)).toBe(before - round!.totalBet + (round!.payout ?? 0n));
    expect(
      await prisma.ledgerTransaction.count({ where: { roundId: round!.id, reason: 'BET' } }),
    ).toBe(1);

    const reused = await start(auth, '30', key).expect(409);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('only one open round per player; it can be resumed from /rounds/active', async () => {
    const { auth } = await signUp();
    const open = await startOpenRound(auth);
    const second = await start(auth).expect(409);
    expect(second.body.code).toBe('ROUND_IN_PROGRESS');

    const active = await http.get('/blackjack/rounds/active').set(auth).expect(200);
    expect(active.body.round.round.id).toBe(open.round.id);
    await playToEnd(auth, open);
    expect(
      (await http.get('/blackjack/rounds/active').set(auth).expect(200)).body.round,
    ).toBeNull();
  });

  it('concurrent actions on the same version: exactly one wins, the rest get 409', async () => {
    const { auth } = await signUp();
    const open = await startOpenRound(auth);
    const action = open.view.phase === 'INSURANCE' ? 'INSURANCE' : 'STAND';
    const extra = action === 'INSURANCE' ? { take: false } : {};
    const results = await Promise.all(
      Array.from({ length: 10 }, () => act(auth, open, action, extra)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const losers = results.filter((r) => r.status !== 200);
    expect(losers.every((r) => r.status === 409)).toBe(true);
    expect(
      losers.every((r) => ['ROUND_VERSION_MISMATCH', 'ROUND_SETTLED'].includes(r.body.code)),
    ).toBe(true);

    const events = await services(app).prisma.roundEvent.findMany({
      where: { roundId: open.round.id },
      orderBy: { seq: 'asc' },
    });
    events.forEach((e, i) => expect(e.seq).toBe(i));
  });

  it('rejects illegal actions, stale versions and bad bets without moving chips', async () => {
    const { auth } = await signUp();
    const open = await startOpenRound(auth);
    const before = await balance(auth);

    if (open.view.phase === 'PLAYER' && !open.view.allowedActions.includes('SPLIT')) {
      const illegal = await act(auth, open, 'SPLIT').expect(422);
      expect(illegal.body.code).toBe('ILLEGAL_ACTION');
    }
    const stale = await act(auth, { ...open, view: { ...open.view, version: 0 } }, 'STAND');
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('ROUND_VERSION_MISMATCH');
    expect(await balance(auth)).toBe(before);

    for (const bet of ['9', '11', '1002', '-10', 'abc']) {
      const res = await start(auth, bet);
      expect(res.status).toBe(400);
    }
    const noKey = await http.post('/blackjack/rounds').set(auth).send({ bet: '10' }).expect(400);
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    await http.get('/blackjack/rounds/does-not-exist').set(auth).expect(404);
  });

  it('insufficient funds: no round is created and the nonce is not consumed', async () => {
    const { auth, userId } = await signUp();
    const { prisma } = services(app);
    const account = await services(app).wallet.getPlayerAccount(userId);
    await prisma.$executeRaw`UPDATE "Account" SET "balance" = 4 WHERE "id" = ${account.id}`;
    try {
      const nonceBefore = (await http.get('/fairness/seeds').set(auth).expect(200)).body.active
        .nextNonce as number;
      const res = await start(auth, '10').expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
      expect(await prisma.gameRound.count({ where: { userId } })).toBe(0);
      const nonceAfter = (await http.get('/fairness/seeds').set(auth).expect(200)).body.active
        .nextNonce as number;
      expect(nonceAfter).toBe(nonceBefore);
    } finally {
      // Restore the cached balance so the global reconciliation stays clean.
      await prisma.$executeRaw`UPDATE "Account" SET "balance" = ${account.balance} WHERE "id" = ${account.id}`;
    }
  });

  it('every stake goes through canBet: a veto stops the bet before any chip moves', async () => {
    const { auth, userId } = await signUp();
    vi.spyOn(app.get(ResponsibleGamingService), 'canBet').mockResolvedValue({
      allowed: false,
      reason: 'SELF_EXCLUDED',
      message: 'Self-excluded',
    });
    const before = await balance(auth);
    const res = await start(auth).expect(403);
    expect(res.body.code).toBe('BET_REJECTED');
    expect(await services(app).prisma.gameRound.count({ where: { userId } })).toBe(0);
    expect(await balance(auth)).toBe(before);
  });

  it('a real round is verifiable after rotating the seed (engine verifier + independent script)', async () => {
    const { auth } = await signUp();
    const open = await startOpenRound(auth);

    const blocked = await http.post('/fairness/rotate').set(auth).send({}).expect(409);
    expect(blocked.body.code).toBe('ROUND_IN_PROGRESS');

    const done = await playToEnd(auth, open);
    const rotated = await http
      .post('/fairness/rotate')
      .set(auth)
      .send({ clientSeed: 'my-new-seed' })
      .expect(200);
    expect(rotated.body.revealed.serverSeedHash).toBe(done.fairness.serverSeedHash);
    expect(rotated.body.active.clientSeed).toBe('my-new-seed');
    expect(rotated.body.active.nextNonce).toBe(0);

    const detail = (await http.get(`/blackjack/rounds/${done.round.id}`).set(auth).expect(200))
      .body as Round;
    const { serverSeed, serverSeedHash, clientSeed, nonce } = detail.fairness;
    expect(serverSeed).toBe(rotated.body.revealed.serverSeed);

    const verification = verifyBlackjackRound({
      serverSeed: serverSeed as string,
      serverSeedHash,
      clientSeed,
      nonce,
      events: detail.events as BlackjackEvent[],
    });
    expect(verification).toMatchObject({ ok: true, eventsReproduced: true });

    // Cross-check with the script that only uses node:crypto.
    const output = execFileSync(
      process.execPath,
      [
        resolve(__dirname, '../../../scripts/verify-fairness.mjs'),
        'shoe',
        '--server-seed',
        serverSeed as string,
        '--client-seed',
        clientSeed,
        '--nonce',
        String(nonce),
        '--cards',
        '30',
      ],
      { encoding: 'utf8' },
    );
    expect(output).toContain(`serverSeedHash: ${serverSeedHash}`);
    const shoe = (output.trim().split('\n').at(-1) as string).split(' ');
    for (const e of detail.events ?? []) {
      if (e.type === 'CARD_DEALT') expect(e.payload.card).toBe(shoe[e.payload.position]);
    }
  });

  it('active server seeds are encrypted at rest and never sent to the client', async () => {
    const { auth, userId } = await signUp();
    const open = await startOpenRound(auth);
    const pair = await services(app).prisma.seedPair.findFirstOrThrow({
      where: { userId, status: 'ACTIVE' },
    });
    expect(pair.serverSeed).toMatch(/^v1:/);
    const seeds = await http.get('/fairness/seeds').set(auth).expect(200);
    expect(seeds.body.active).not.toHaveProperty('serverSeed');
    const everything = JSON.stringify([open, seeds.body]);
    expect(everything).not.toContain(pair.serverSeed);
  });

  it('round history lists the rounds, newest first', async () => {
    const { auth } = await signUp();
    const first = await playToEnd(auth, await startOpenRound(auth));
    const second = await playToEnd(auth, await startOpenRound(auth));
    const res = await http.get('/rounds?limit=50').set(auth).expect(200);
    const ids = res.body.rounds.map((r: { id: string }) => r.id);
    expect(ids.indexOf(second.round.id)).toBeLessThan(ids.indexOf(first.round.id));
  });

  it('start and action responses carry exactly the new events, hole card hidden', async () => {
    const { auth } = await signUp();
    const open = await startOpenRound(auth);
    expect(open.events?.map((e) => e.seq)).toEqual(
      Array.from({ length: open.view.version }, (_, i) => i),
    );
    const hole = open.events?.find(
      (e) => e.type === 'CARD_DEALT' && e.payload.to === 'DEALER' && e.payload.faceDown,
    );
    expect(hole?.payload).toMatchObject({ card: null });

    let current = open;
    while (current.view.phase !== 'SETTLED') {
      const res =
        current.view.phase === 'INSURANCE'
          ? await act(auth, current, 'INSURANCE', { take: false })
          : await act(auth, current, 'STAND');
      const next = res.body as Round;
      const seqs = next.events?.map((e) => e.seq) ?? [];
      expect(seqs[0]).toBe(current.view.version);
      expect(seqs.at(-1)).toBe(next.view.version - 1);
      current = next;
    }
    const revealed = current.events?.find((e) => e.type === 'HOLE_CARD_REVEALED');
    expect(revealed?.payload).toMatchObject({ card: expect.stringMatching(/^[A2-9TJQK][SHDC]$/) });
  });

  it('round events are append-only in the database', async () => {
    const { auth } = await signUp();
    const done = await playToEnd(auth, await startOpenRound(auth));
    const { prisma } = services(app);
    await expect(
      prisma.$executeRaw`UPDATE "RoundEvent" SET "type" = 'X' WHERE "roundId" = ${done.round.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM "RoundEvent" WHERE "roundId" = ${done.round.id}`,
    ).rejects.toThrow(/append-only/);
  });
});
