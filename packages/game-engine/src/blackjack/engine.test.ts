import { describe, expect, it } from 'vitest';
import type { Rng } from '../rng';
import { stackedRng } from './__tests__/stacked-rng';
import type { Card } from './cards';
import {
  actionCost,
  allowedActions,
  applyAction,
  blackjack,
  init,
  replayEvents,
  settle,
} from './engine';
import { redactEvents, toPlayerView } from './view';
import type { BlackjackAction, BlackjackEvent, BlackjackState } from './types';

const BET = 10n;

/** Plays a scripted round on a stacked shoe and returns the final state and all events. */
function play(order: Card[], actions: BlackjackAction[] = [], bet = BET) {
  const rng = stackedRng(order);
  let { state, events } = init({ bet }, rng());
  const all: BlackjackEvent[] = [...events];
  for (const action of actions) {
    ({ state, events } = applyAction(state, action, rng()));
    all.push(...events);
  }
  return { state, events: all, rng };
}

const types = (events: BlackjackEvent[]) => events.map((e) => e.type);
const results = (state: BlackjackState) => state.hands.map((h) => h.result);

describe('blackjack engine (bj-v1)', () => {
  it('deals player, dealer up, player, dealer hole', () => {
    const { events } = play(['TS', '9C', '7H', '5D'], []);
    const dealt = events.filter((e) => e.type === 'CARD_DEALT').map((e) => e.payload);
    expect(dealt).toEqual([
      { to: 'PLAYER', hand: 0, card: 'TS', position: 0 },
      { to: 'DEALER', card: '9C', faceDown: false, position: 1 },
      { to: 'PLAYER', hand: 0, card: '7H', position: 2 },
      { to: 'DEALER', card: '5D', faceDown: true, position: 3 },
    ]);
  });

  it('player blackjack pays 3:2 and ends the round at once', () => {
    const { state } = play(['AS', '9C', 'KH', '7D']);
    expect(state.phase).toBe('SETTLED');
    expect(results(state)).toEqual(['BLACKJACK']);
    expect(settle(state)).toEqual({ bet: 10n, payout: 25n });
    expect(state.dealer.cards).toHaveLength(2); // dealer does not draw
  });

  it('dealer peeks with a ten up: dealer blackjack wins before the player acts', () => {
    const { state, events } = play(['9S', 'KC', '8H', 'AD']);
    expect(types(events)).toContain('DEALER_PEEKED');
    expect(events.find((e) => e.type === 'DEALER_PEEKED')?.payload).toEqual({ blackjack: true });
    expect(results(state)).toEqual(['LOSE']);
    expect(settle(state)).toEqual({ bet: 10n, payout: 0n });
  });

  it('blackjack against dealer blackjack is a push', () => {
    const { state } = play(['AS', 'KC', 'KH', 'AD']);
    expect(results(state)).toEqual(['PUSH']);
    expect(state.payout).toBe(10n);
  });

  it('insurance: offered with an ace up, pays 2:1 when the dealer has blackjack', () => {
    const offered = play(['TS', 'AC', '9H', 'KD']);
    expect(offered.state.phase).toBe('INSURANCE');
    expect(allowedActions(offered.state)).toEqual(['INSURANCE']);
    expect(actionCost(offered.state, { type: 'INSURANCE', take: true })).toBe(5n);

    const { state } = play(['TS', 'AC', '9H', 'KD'], [{ type: 'INSURANCE', take: true }]);
    expect(results(state)).toEqual(['LOSE']);
    expect(settle(state)).toEqual({ bet: 15n, payout: 15n }); // lose 10, insurance wins 5 × 2
  });

  it('insurance declined, dealer has no blackjack: play continues and the dealer draws', () => {
    const { state } = play(
      ['TS', 'AC', '9H', '5D', '2S'],
      [{ type: 'INSURANCE', take: false }, { type: 'STAND' }],
    );
    expect(state.dealer.cards).toEqual(['AC', '5D', '2S']); // soft 16 → hit → soft 18
    expect(results(state)).toEqual(['WIN']); // 19 vs 18
    expect(settle(state)).toEqual({ bet: 10n, payout: 20n });
  });

  it('busting ends the round without dealer draws', () => {
    const { state } = play(['TS', '7C', '6H', '9D', 'KS'], [{ type: 'HIT' }]);
    expect(state.hands[0]?.status).toBe('BUSTED');
    expect(state.dealer.cards).toHaveLength(2);
    expect(state.dealer.holeRevealed).toBe(true);
    expect(settle(state)).toEqual({ bet: 10n, payout: 0n });
  });

  it('double: one card, double stake, dealer busts', () => {
    const { state } = play(['5S', '6C', '6H', 'TD', '9S', 'TC'], [{ type: 'DOUBLE' }]);
    expect(state.hands[0]).toMatchObject({ doubled: true, bet: 20n, status: 'STOOD' });
    expect(state.hands[0]?.cards).toHaveLength(3);
    expect(settle(state)).toEqual({ bet: 20n, payout: 40n });
  });

  it('cannot double on three cards', () => {
    const { state } = play(['2S', '6C', '3H', 'TD', '4S'], [{ type: 'HIT' }]);
    expect(allowedActions(state)).toEqual(['HIT', 'STAND']);
    expect(() => applyAction(state, { type: 'DOUBLE' }, stackedRng([])())).toThrow(/double/);
  });

  it('split: two hands, each gets a card, dealer busts against both', () => {
    const { state } = play(
      ['8S', '6C', '8H', 'TD', 'TS', '9H', '7C'],
      [{ type: 'SPLIT' }, { type: 'STAND' }, { type: 'STAND' }],
    );
    expect(state.hands.map((h) => h.cards)).toEqual([
      ['8S', 'TS'],
      ['8H', '9H'],
    ]);
    expect(results(state)).toEqual(['WIN', 'WIN']);
    expect(settle(state)).toEqual({ bet: 20n, payout: 40n });
  });

  it('split aces get one card each; 21 after a split is not a blackjack', () => {
    const { state } = play(['AS', '6C', 'AH', 'TD', 'KS', '9H', '5S'], [{ type: 'SPLIT' }]);
    expect(state.phase).toBe('SETTLED');
    expect(state.hands.map((h) => [h.cards.length, h.status])).toEqual([
      [2, 'STOOD'],
      [2, 'STOOD'],
    ]);
    // Dealer 16 + 5 = 21: the split 21 pushes (it would win 3:2 if it were a blackjack).
    expect(results(state)).toEqual(['PUSH', 'LOSE']);
  });

  it('resplits up to 4 hands, then splitting is no longer allowed', () => {
    const rng = stackedRng(['8S', '6C', '8H', 'TD', '8C', '8D', '8S', '8H', 'TS', 'TH']);
    let { state } = init({ bet: BET }, rng());
    for (let i = 0; i < 3; i++) {
      expect(allowedActions(state)).toContain('SPLIT');
      state = applyAction(state, { type: 'SPLIT' }, rng()).state;
    }
    expect(state.hands).toHaveLength(4);
    expect(allowedActions(state)).not.toContain('SPLIT');
    expect(state.totalBet).toBe(40n);
  });

  it('dealer stands on soft 17', () => {
    const { state } = play(['TS', '6C', '8H', 'AD'], [{ type: 'STAND' }]);
    expect(state.dealer.cards).toEqual(['6C', 'AD']);
    expect(results(state)).toEqual(['WIN']); // 18 vs 17
  });

  it('equal totals push', () => {
    const { state } = play(['TS', 'TC', '8H', '8D'], [{ type: 'STAND' }]);
    expect(results(state)).toEqual(['PUSH']);
    expect(state.payout).toBe(BET);
  });

  it('rejects illegal actions without changing anything', () => {
    const insurance = play(['TS', 'AC', '9H', '5D']).state;
    expect(() => applyAction(insurance, { type: 'HIT' }, stackedRng([])())).toThrow(
      expect.objectContaining({ code: 'INSURANCE_PENDING' }),
    );
    const normal = play(['TS', '9C', '7H', '5D']).state;
    expect(() => applyAction(normal, { type: 'INSURANCE', take: true }, stackedRng([])())).toThrow(
      expect.objectContaining({ code: 'INSURANCE_NOT_OFFERED' }),
    );
    expect(() => applyAction(normal, { type: 'SPLIT' }, stackedRng([])())).toThrow(
      expect.objectContaining({ code: 'CANNOT_SPLIT' }),
    );
    expect(() =>
      applyAction(normal, { type: 'NOPE' } as unknown as BlackjackAction, stackedRng([])()),
    ).toThrow(expect.objectContaining({ code: 'UNKNOWN_ACTION' }));
    const settled = play(['AS', '9C', 'KH', '7D']).state;
    expect(() => applyAction(settled, { type: 'STAND' }, stackedRng([])())).toThrow(
      expect.objectContaining({ code: 'ROUND_SETTLED' }),
    );
  });

  it.each([0n, -2n, 7n])('rejects bet %s (must be positive and even)', (bet) => {
    expect(() => init({ bet }, stackedRng([])())).toThrow(
      expect.objectContaining({ code: 'INVALID_BET' }),
    );
  });

  it('settle() refuses an unfinished round', () => {
    expect(() => settle(play(['TS', '9C', '7H', '5D']).state)).toThrow(/not settled/);
  });

  it('implements the Game contract: replay rebuilds the live state', () => {
    const { state, events } = play(
      ['8S', '6C', '8H', 'TD', 'TS', '9H', '7C'],
      [{ type: 'SPLIT' }, { type: 'STAND' }, { type: 'STAND' }],
    );
    expect(blackjack.id).toBe('blackjack');
    expect(blackjack.replay({ bet: BET }, events)).toEqual(state);
    expect(replayEvents(events)).toEqual(state);
  });

  it('replay rejects corrupted logs', () => {
    const { events } = play(['TS', '9C', '7H', '5D']);
    expect(() => replayEvents([])).toThrow();
    expect(() => replayEvents(events.slice(1))).toThrow(/ROUND_STARTED/);
    const reordered = [events[0], events[2], events[1]] as BlackjackEvent[];
    expect(() => replayEvents(reordered)).toThrow(/out of order/);
  });
});

describe('hidden information', () => {
  const rng: () => Rng = stackedRng(['TS', '9C', '7H', '5D', '4S']);
  const { state, events } = init({ bet: BET }, rng());

  it('the player view hides the hole card until it is revealed', () => {
    const view = toPlayerView(state);
    expect(view.dealer.cards).toEqual(['9C', null]);
    expect(view.dealer.total).toBe(9);
    expect(JSON.stringify(view)).not.toContain('5D');
    expect(view.allowedActions).toEqual(['HIT', 'STAND', 'DOUBLE']);
    expect(view.version).toBe(state.nextSeq);
  });

  it('the event log sent to the player hides the hole card until it is revealed', () => {
    expect(JSON.stringify(redactEvents(events))).not.toContain('5D');
    const finished = applyAction(state, { type: 'STAND' }, rng());
    const all = [...events, ...finished.events];
    expect(JSON.stringify(redactEvents(all))).toContain('5D');
    expect(toPlayerView(finished.state).dealer.cards).toEqual(['9C', '5D', '4S']);
  });
});
