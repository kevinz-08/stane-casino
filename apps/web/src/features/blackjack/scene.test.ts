import {
  allowedActions,
  applyAction,
  type BlackjackAction,
  type BlackjackEvent,
  createHmacRng,
  init,
  redactEvents,
  toPlayerView,
} from '@casino/game-engine';
import { describe, expect, it } from 'vitest';
import { applyEvent, type Scene, sceneFromView, sceneSignature } from './scene';
import { stepFor } from './timeline';

const OPTIONS: BlackjackAction[] = [
  { type: 'HIT' },
  { type: 'STAND' },
  { type: 'DOUBLE' },
  { type: 'SPLIT' },
  { type: 'INSURANCE', take: true },
  { type: 'INSURANCE', take: false },
];

/**
 * Simulates what the browser receives: after each request, the server sends
 * `redactEvents(all events so far).slice(previous version)` and the new view.
 */
function* responses(nonce: number) {
  let seed = nonce * 7919 + 1;
  const choose = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
  const params = { serverSeed: 'scene-test', clientSeed: 'browser', nonce };
  let { state, events } = init({ bet: 20n }, createHmacRng(params));
  const all: BlackjackEvent[] = [...events];
  yield { delta: redactEvents(all), view: toPlayerView(state) };
  while (state.phase !== 'SETTLED') {
    const legal = allowedActions(state);
    const options = OPTIONS.filter((a) => legal.includes(a.type));
    const before = all.length;
    ({ state, events } = applyAction(
      state,
      options[choose(options.length)]!,
      createHmacRng(params),
    ));
    all.push(...events);
    yield { delta: redactEvents(all).slice(before), view: toPlayerView(state) };
  }
}

describe('animated scene vs server view', () => {
  it('after every response of 3,000 random rounds, the event-built scene equals the view', () => {
    for (let nonce = 0; nonce < 3000; nonce++) {
      let scene: Scene | null = null;
      for (const { delta, view } of responses(nonce)) {
        for (const event of delta) {
          scene = applyEvent(scene, event);
          stepFor(event, scene); // every event has a staging step
        }
        const expected = sceneSignature(sceneFromView(view));
        if (sceneSignature(scene as Scene) !== expected) {
          expect(JSON.parse(sceneSignature(scene as Scene))).toEqual(JSON.parse(expected));
        }
      }
    }
  });

  it('never knows the hole card before it is revealed', () => {
    for (let nonce = 0; nonce < 300; nonce++) {
      let scene: Scene | null = null;
      for (const { delta } of responses(nonce)) {
        for (const event of delta) {
          scene = applyEvent(scene, event);
          const hole = scene.dealer.cards[1];
          if (hole && !scene.dealer.holeRevealed) {
            expect(hole).toMatchObject({ card: null, faceUp: false });
          }
        }
      }
    }
  });

  it('gives fresh cards stable keys by shoe position, and keeps them through a split', () => {
    let scene: Scene | null = null;
    for (const event of [
      { seq: 0, type: 'ROUND_STARTED', payload: { rulesVersion: 'bj-v1', bet: '10' } },
      { seq: 1, type: 'CARD_DEALT', payload: { to: 'PLAYER', hand: 0, card: '8S', position: 0 } },
      {
        seq: 2,
        type: 'CARD_DEALT',
        payload: { to: 'DEALER', card: '6C', faceDown: false, position: 1 },
      },
      { seq: 3, type: 'CARD_DEALT', payload: { to: 'PLAYER', hand: 0, card: '8H', position: 2 } },
      {
        seq: 4,
        type: 'CARD_DEALT',
        payload: { to: 'DEALER', card: null, faceDown: true, position: 3 },
      },
      { seq: 5, type: 'HAND_SPLIT', payload: { hand: 0, newHand: 1, additionalBet: '10' } },
    ] as unknown as BlackjackEvent[]) {
      scene = applyEvent(scene, event);
    }
    expect(scene!.hands.map((h) => h.cards.map((c) => c.key))).toEqual([['c0'], ['c2']]);
    expect(scene!.totalBet).toBe('20');
    expect(scene!.dealer.total).toBe(6);
  });
});
