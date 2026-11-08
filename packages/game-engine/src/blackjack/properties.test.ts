import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createHmacRng } from '../rng';
import { type Card, handValue } from './cards';
import { actionCost, allowedActions, applyAction, init, replayEvents } from './engine';
import { BLACKJACK_RULES_V1 } from './rules';
import {
  type BlackjackAction,
  type BlackjackActionType,
  type BlackjackEvent,
  type BlackjackState,
  IllegalActionError,
} from './types';
import { deepEqual, verifyBlackjackRound } from './verify';
import { commitServerSeed } from '../fairness';

const ALL_ACTIONS: BlackjackAction[] = [
  { type: 'HIT' },
  { type: 'STAND' },
  { type: 'DOUBLE' },
  { type: 'SPLIT' },
  { type: 'INSURANCE', take: true },
  { type: 'INSURANCE', take: false },
];

interface Played {
  state: BlackjackState;
  events: BlackjackEvent[];
  snapshots: Array<{ state: BlackjackState; events: number }>;
  staked: bigint;
}

/** Plays one round choosing uniformly among the legal actions (`pick` returns [0, n)). */
function playRandom(
  params: { serverSeed: string; clientSeed: string; nonce: number },
  bet: bigint,
  pick: (n: number) => number,
): Played {
  const rng = () => createHmacRng(params);
  let { state, events } = init({ bet }, rng());
  const all = [...events];
  const snapshots = [{ state, events: all.length }];
  let staked = bet;
  while (state.phase !== 'SETTLED') {
    const legal: BlackjackActionType[] = allowedActions(state);
    const candidates = ALL_ACTIONS.filter((a) => legal.includes(a.type));
    const action = candidates[pick(candidates.length)] as BlackjackAction;
    staked += actionCost(state, action);
    ({ state, events } = applyAction(state, action, rng()));
    all.push(...events);
    snapshots.push({ state, events: all.length });
  }
  return { state, events: all, snapshots, staked };
}

function checkInvariants({ state, events, staked }: Played): void {
  // Event log: contiguous sequence numbers, starts with ROUND_STARTED, ends with ROUND_SETTLED.
  events.forEach((e, i) => expect(e.seq).toBe(i));
  expect(events[0]?.type).toBe('ROUND_STARTED');
  expect(events.at(-1)?.type).toBe('ROUND_SETTLED');

  // Chip conservation: what was staked is exactly what the state says, and the payout is the
  // sum of what each hand and the insurance returned.
  const handBets = state.hands.reduce((s, h) => s + h.bet, 0n);
  expect(state.totalBet).toBe(handBets + (state.insurance.bet ?? 0n));
  expect(state.totalBet).toBe(staked);
  const settled = events.at(-1) as Extract<BlackjackEvent, { type: 'ROUND_SETTLED' }>;
  const handPayouts = state.hands.reduce((s, h) => s + (h.payout ?? 0n), 0n);
  expect(state.payout).toBe(handPayouts + BigInt(settled.payload.insurancePayout));
  expect(state.payout! >= 0n).toBe(true);
  expect(state.payout! <= state.totalBet * 3n).toBe(true); // max: win 3:2 / even money / 2:1

  // Cards: never more copies than the shoe holds; every dealt card is somewhere on the table.
  const onTable = [...state.dealer.cards, ...state.hands.flatMap((h) => h.cards)];
  expect(onTable).toHaveLength(state.cardsDealt);
  expect(events.filter((e) => e.type === 'CARD_DEALT')).toHaveLength(state.cardsDealt);
  const copies = new Map<Card, number>();
  for (const c of onTable) copies.set(c, (copies.get(c) ?? 0) + 1);
  for (const n of copies.values()) expect(n).toBeLessThanOrEqual(BLACKJACK_RULES_V1.decks);

  // Table rules.
  expect(state.hands.length).toBeLessThanOrEqual(BLACKJACK_RULES_V1.maxHands);
  expect(state.dealer.holeRevealed).toBe(true);
  for (const hand of state.hands) {
    expect(hand.status).not.toBe('PLAYING');
    expect(hand.status === 'BUSTED').toBe(handValue(hand.cards).total > 21);
    if (hand.splitAces) expect(hand.cards).toHaveLength(2);
    if (hand.doubled) expect(hand.cards).toHaveLength(3); // two cards + exactly one more
  }
  const dealerDrew = state.dealer.cards.length > 2;
  if (dealerDrew) {
    const beforeLast = handValue(state.dealer.cards.slice(0, -1)).total;
    expect(beforeLast).toBeLessThan(17); // never hits a hard or soft 17+
  }
}

describe('blackjack properties', () => {
  it('10,000 random rounds: replaying the stored events reproduces the exact final state', () => {
    let seed = 12345;
    const pick = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31; // deterministic LCG for the decisions
      return seed % n;
    };
    for (let nonce = 0; nonce < 10_000; nonce++) {
      const played = playRandom(
        { serverSeed: 'replay-10k', clientSeed: 'random-player', nonce },
        BigInt(2 + 2 * (nonce % 50)),
        pick,
      );
      const replayed = replayEvents(played.events);
      if (!deepEqual(replayed, played.state)) {
        expect(replayed).toEqual(played.state); // shows the diff
      }
      // Also every intermediate state (a round resumed mid-way).
      for (const snap of played.snapshots) {
        if (!deepEqual(replayEvents(played.events.slice(0, snap.events)), snap.state)) {
          throw new Error(`intermediate replay mismatch in round ${nonce}`);
        }
      }
      checkInvariants(played);
    }
  });

  it('property: any legal sequence of actions keeps the round consistent', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 20 }),
        fc.nat({ max: 1_000_000 }),
        fc.integer({ min: 1, max: 5000 }).map((n) => BigInt(n * 2)),
        fc.infiniteStream(fc.nat()),
        (serverSeed, nonce, bet, choices) => {
          const it = choices[Symbol.iterator]();
          checkInvariants(
            playRandom({ serverSeed, clientSeed: 'fc', nonce }, bet, (n) => it.next().value % n),
          );
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('property: illegal actions are always rejected with IllegalActionError', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), fc.infiniteStream(fc.nat()), (nonce, choices) => {
        const it = choices[Symbol.iterator]();
        const params = { serverSeed: 'illegal', clientSeed: 'fc', nonce };
        let { state } = init({ bet: 10n }, createHmacRng(params));
        while (state.phase !== 'SETTLED') {
          const legal = allowedActions(state);
          for (const action of ALL_ACTIONS.filter((a) => !legal.includes(a.type))) {
            expect(() => applyAction(state, action, createHmacRng(params))).toThrow(
              IllegalActionError,
            );
          }
          const options = ALL_ACTIONS.filter((a) => legal.includes(a.type));
          const action = options[it.next().value % options.length] as BlackjackAction;
          state = applyAction(state, action, createHmacRng(params)).state;
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('public round verifier', () => {
  const serverSeed = 'revealed-after-rotation';
  const params = { serverSeed, clientSeed: 'player-chosen', nonce: 7 };
  const played = (() => {
    let s = 1;
    return playRandom(params, 20n, (n) => (s = (s * 48271) % 2147483647) % n);
  })();
  const input = { ...params, serverSeedHash: commitServerSeed(serverSeed), events: played.events };

  it('accepts an honest round and rebuilds it', () => {
    const result = verifyBlackjackRound(input);
    expect(result).toMatchObject({ ok: true, commitmentValid: true, eventsReproduced: true });
    expect(result.state).toEqual(played.state);
  });

  it('accepts events whose JSON keys were reordered (as jsonb does)', () => {
    const reordered = JSON.parse(
      JSON.stringify(played.events, (_k, v: unknown) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ),
    ) as BlackjackEvent[];
    expect(verifyBlackjackRound({ ...input, events: reordered }).ok).toBe(true);
  });

  it('detects a server seed that does not match the published commitment', () => {
    const result = verifyBlackjackRound({ ...input, serverSeedHash: commitServerSeed('other') });
    expect(result).toMatchObject({ ok: false, commitmentValid: false, eventsReproduced: true });
  });

  it('detects a tampered card', () => {
    const events = structuredCloneEvents(played.events);
    const dealt = events.find((e) => e.type === 'CARD_DEALT' && e.payload.to === 'DEALER');
    (dealt!.payload as { card: Card }).card =
      (dealt!.payload as { card: Card }).card === 'AS' ? 'KS' : 'AS';
    const result = verifyBlackjackRound({ ...input, events });
    expect(result.ok).toBe(false);
    expect(result.mismatch?.seq).toBe(dealt!.seq);
  });

  it('detects a tampered payout and a truncated or reseeded log', () => {
    const events = structuredCloneEvents(played.events);
    const last = events.at(-1) as Extract<BlackjackEvent, { type: 'ROUND_SETTLED' }>;
    last.payload.payout = '999999';
    expect(verifyBlackjackRound({ ...input, events }).eventsReproduced).toBe(false);
    expect(verifyBlackjackRound({ ...input, events: [] }).ok).toBe(false);
    expect(verifyBlackjackRound({ ...input, nonce: 8 }).ok).toBe(false);
  });
});

function structuredCloneEvents(events: BlackjackEvent[]): BlackjackEvent[] {
  return JSON.parse(JSON.stringify(events)) as BlackjackEvent[];
}
