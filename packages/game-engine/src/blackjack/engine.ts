import type { Game, Settlement, StepResult } from '../core';
import { LazyShuffle, type Rng } from '../rng';
import { type Card, canonicalShoe, cardValue, handValue, isNatural, rankOf } from './cards';
import { BLACKJACK_RULES_V1, type BlackjackRules, rulesFor } from './rules';
import {
  type BlackjackAction,
  type BlackjackActionType,
  type BlackjackConfig,
  type BlackjackEvent,
  type BlackjackState,
  type HandResult,
  IllegalActionError,
  type PlayerHand,
} from './types';

/*
 * Design: `reduce` is the ONLY function that changes state. Game logic decides what happens and
 * emits events; each event is immediately folded with `reduce`. Hence replaying the stored
 * events always rebuilds exactly the live state, and verification only needs the events.
 *
 * Randomness: the shoe is a lazy Fisher–Yates over the round's Rng. `init` and `applyAction`
 * both expect a FRESH Rng for the round (same serverSeed/clientSeed/nonce) and fast-forward it
 * past `state.cardsDealt` cards, so a round can be resumed across HTTP requests.
 */

// --- reducer -----------------------------------------------------------------------------

type Draft = { -readonly [K in keyof BlackjackState]: BlackjackState[K] };

function newHand(cards: Card[], bet: bigint, fromSplit: boolean): PlayerHand {
  return {
    cards,
    bet,
    doubled: false,
    fromSplit,
    splitAces: fromSplit && rankOf(cards[0] as Card) === 'A',
    status: 'PLAYING',
    result: null,
    payout: null,
  };
}

/** Hand status after receiving a card: busts, auto-stands on 21, after a double or split ace. */
function withCard(hand: PlayerHand, card: Card): PlayerHand {
  const cards = [...hand.cards, card];
  const { total } = handValue(cards);
  let status = hand.status;
  if (total > 21) status = 'BUSTED';
  else if (total === 21 || hand.doubled || (hand.splitAces && cards.length >= 2)) status = 'STOOD';
  return { ...hand, cards, status };
}

function replaceHand(hands: readonly PlayerHand[], index: number, hand: PlayerHand) {
  return hands.map((h, i) => (i === index ? hand : h));
}

function handAt(state: BlackjackState, index: number): PlayerHand {
  const hand = state.hands[index];
  if (!hand) throw new Error(`event refers to unknown hand ${index}`);
  return hand;
}

export function reduce(state: BlackjackState | null, event: BlackjackEvent): BlackjackState {
  if (event.type === 'ROUND_STARTED') {
    if (state !== null || event.seq !== 0) throw new Error('ROUND_STARTED must be the first event');
    const bet = BigInt(event.payload.bet);
    return {
      status: 'IN_PROGRESS',
      bet,
      rulesVersion: event.payload.rulesVersion,
      phase: 'PLAYER',
      dealer: { cards: [], holeRevealed: false },
      hands: [newHand([], bet, false)],
      activeHand: 0,
      cardsDealt: 0,
      insurance: { offered: false, bet: null },
      totalBet: bet,
      payout: null,
      nextSeq: 1,
    };
  }
  if (state === null) throw new Error('first event must be ROUND_STARTED');
  if (event.seq !== state.nextSeq) {
    throw new Error(`event seq ${event.seq} out of order (expected ${state.nextSeq})`);
  }
  if (state.status === 'SETTLED') throw new Error('round already settled');

  const next: Draft = { ...state, nextSeq: event.seq + 1 };

  switch (event.type) {
    case 'CARD_DEALT': {
      if (event.payload.position !== state.cardsDealt) {
        throw new Error(`card position ${event.payload.position} != ${state.cardsDealt}`);
      }
      next.cardsDealt = state.cardsDealt + 1;
      if (event.payload.to === 'DEALER') {
        next.dealer = { ...state.dealer, cards: [...state.dealer.cards, event.payload.card] };
      } else {
        const hand = handAt(state, event.payload.hand);
        next.hands = replaceHand(
          state.hands,
          event.payload.hand,
          withCard(hand, event.payload.card),
        );
      }
      return next;
    }
    case 'INSURANCE_OFFERED':
      next.phase = 'INSURANCE';
      next.insurance = { offered: true, bet: null };
      return next;
    case 'INSURANCE_DECIDED': {
      const amount = BigInt(event.payload.amount);
      next.phase = 'PLAYER';
      next.insurance = { offered: true, bet: event.payload.take ? amount : null };
      next.totalBet = state.totalBet + (event.payload.take ? amount : 0n);
      return next;
    }
    case 'HAND_HIT':
    case 'DEALER_PEEKED':
      return next; // markers: the consequences are separate events
    case 'HAND_STOOD':
      next.hands = replaceHand(state.hands, event.payload.hand, {
        ...handAt(state, event.payload.hand),
        status: 'STOOD',
      });
      return next;
    case 'HAND_DOUBLED': {
      const extra = BigInt(event.payload.additionalBet);
      const hand = handAt(state, event.payload.hand);
      next.hands = replaceHand(state.hands, event.payload.hand, {
        ...hand,
        bet: hand.bet + extra,
        doubled: true,
      });
      next.totalBet = state.totalBet + extra;
      return next;
    }
    case 'HAND_SPLIT': {
      const extra = BigInt(event.payload.additionalBet);
      const hand = handAt(state, event.payload.hand);
      const [first, second] = hand.cards as [Card, Card];
      const hands = [...state.hands];
      hands.splice(event.payload.hand, 1, newHand([first], hand.bet, true));
      hands.splice(event.payload.newHand, 0, newHand([second], extra, true));
      next.hands = hands;
      next.totalBet = state.totalBet + extra;
      return next;
    }
    case 'ACTIVE_HAND_CHANGED':
      next.activeHand = event.payload.hand;
      return next;
    case 'HOLE_CARD_REVEALED':
      next.dealer = { ...state.dealer, holeRevealed: true };
      return next;
    case 'ROUND_SETTLED': {
      const results = new Map(event.payload.hands.map((h) => [h.hand, h]));
      next.hands = state.hands.map((hand, i) => {
        const r = results.get(i);
        if (!r) throw new Error(`missing settlement for hand ${i}`);
        // A hand still in play when the round ends early (dealer blackjack) is closed as stood.
        const status = hand.status === 'PLAYING' ? 'STOOD' : hand.status;
        return { ...hand, status, result: r.result, payout: BigInt(r.payout) };
      });
      next.payout = BigInt(event.payload.payout);
      next.status = 'SETTLED';
      next.phase = 'SETTLED';
      return next;
    }
  }
}

export function replayEvents(events: readonly BlackjackEvent[]): BlackjackState {
  let state: BlackjackState | null = null;
  for (const event of events) state = reduce(state, event);
  if (!state) throw new Error('no events to replay');
  return state;
}

// --- rules helpers -----------------------------------------------------------------------

function activeHand(state: BlackjackState): PlayerHand | undefined {
  return state.phase === 'PLAYER' ? state.hands[state.activeHand] : undefined;
}

export function canDouble(state: BlackjackState): boolean {
  const rules = rulesFor(state.rulesVersion);
  const hand = activeHand(state);
  return (
    !!hand &&
    hand.status === 'PLAYING' &&
    hand.cards.length === 2 &&
    !hand.splitAces &&
    (!hand.fromSplit || rules.doubleAfterSplit)
  );
}

export function canSplit(state: BlackjackState): boolean {
  const rules = rulesFor(state.rulesVersion);
  const hand = activeHand(state);
  if (!hand || hand.status !== 'PLAYING' || hand.cards.length !== 2) return false;
  const [a, b] = hand.cards as [Card, Card];
  if (cardValue(a) !== cardValue(b)) return false;
  if (state.hands.length >= rules.maxHands) return false;
  return !(hand.splitAces && !rules.resplitAces);
}

/** Actions the player may take now (what the UI should enable). */
export function allowedActions(state: BlackjackState): BlackjackActionType[] {
  if (state.phase === 'SETTLED') return [];
  if (state.phase === 'INSURANCE') return ['INSURANCE'];
  const actions: BlackjackActionType[] = ['HIT', 'STAND'];
  if (canDouble(state)) actions.push('DOUBLE');
  if (canSplit(state)) actions.push('SPLIT');
  return actions;
}

/** Extra chips the action stakes (to be debited BEFORE applying it). */
export function actionCost(state: BlackjackState, action: BlackjackAction): bigint {
  switch (action.type) {
    case 'DOUBLE':
    case 'SPLIT':
      return activeHand(state)?.bet ?? 0n;
    case 'INSURANCE':
      return action.take ? state.bet / 2n : 0n;
    default:
      return 0n;
  }
}

// --- game logic --------------------------------------------------------------------------

class Round {
  readonly events: BlackjackEvent[] = [];

  constructor(
    public state: BlackjackState,
    readonly rules: BlackjackRules,
    private readonly shoe: LazyShuffle<Card>,
  ) {}

  static start(bet: bigint, rules: BlackjackRules, rng: Rng): Round {
    const started: BlackjackEvent = {
      seq: 0,
      type: 'ROUND_STARTED',
      payload: { rulesVersion: rules.version, bet: bet.toString() },
    };
    const round = new Round(reduce(null, started), rules, newShoe(rules, rng));
    round.events.push(started);
    return round;
  }

  emit(event: DistributiveOmit<BlackjackEvent, 'seq'>): void {
    const full = { ...event, seq: this.state.nextSeq } as BlackjackEvent;
    this.state = reduce(this.state, full);
    this.events.push(full);
  }

  dealToPlayer(hand: number): void {
    const position = this.state.cardsDealt;
    this.emit({
      type: 'CARD_DEALT',
      payload: { to: 'PLAYER', hand, card: this.shoe.draw(), position },
    });
  }

  dealToDealer(faceDown: boolean): void {
    const position = this.state.cardsDealt;
    this.emit({
      type: 'CARD_DEALT',
      payload: { to: 'DEALER', card: this.shoe.draw(), faceDown, position },
    });
  }
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

function newShoe(rules: BlackjackRules, rng: Rng): LazyShuffle<Card> {
  return new LazyShuffle(canonicalShoe(rules.decks), rng);
}

function afterInsurance(round: Round): void {
  const { state, rules } = round;
  const up = state.dealer.cards[0] as Card;
  if (rules.dealerPeeks && (cardValue(up) === 1 || cardValue(up) === 10)) {
    const blackjack = isNatural(state.dealer.cards);
    round.emit({ type: 'DEALER_PEEKED', payload: { blackjack } });
    if (blackjack) return finish(round, false);
  }
  if (isNatural((round.state.hands[0] as PlayerHand).cards)) return finish(round, false);
}

/** Moves to the next playable hand, or plays the dealer and settles when none is left. */
function advance(round: Round): void {
  const { state } = round;
  if ((state.hands[state.activeHand] as PlayerHand).status === 'PLAYING') return;
  const next = state.hands.findIndex((h, i) => i > state.activeHand && h.status === 'PLAYING');
  if (next !== -1) {
    round.emit({ type: 'ACTIVE_HAND_CHANGED', payload: { hand: next } });
    return;
  }
  finish(
    round,
    round.state.hands.some((h) => h.status !== 'BUSTED'),
  );
}

function dealerMustHit(cards: readonly Card[], rules: BlackjackRules): boolean {
  const { total, soft } = handValue(cards);
  return total < 17 || (total === 17 && soft && !rules.dealerStandsSoft17);
}

function finish(round: Round, playDealer: boolean): void {
  if (!round.state.dealer.holeRevealed) {
    round.emit({
      type: 'HOLE_CARD_REVEALED',
      payload: { card: round.state.dealer.cards[1] as Card },
    });
  }
  if (playDealer) {
    while (dealerMustHit(round.state.dealer.cards, round.rules)) round.dealToDealer(false);
  }
  round.emit({ type: 'ROUND_SETTLED', payload: settlementOf(round.state, round.rules) });
}

function settlementOf(state: BlackjackState, rules: BlackjackRules) {
  const dealerNatural = isNatural(state.dealer.cards);
  const dealer = handValue(state.dealer.cards).total;
  const [num, den] = rules.blackjackPayout;

  const hands = state.hands.map((hand, i) => {
    const natural = !hand.fromSplit && state.hands.length === 1 && isNatural(hand.cards);
    const player = handValue(hand.cards).total;
    let result: HandResult;
    if (dealerNatural) result = natural ? 'PUSH' : 'LOSE';
    else if (natural) result = 'BLACKJACK';
    else if (hand.status === 'BUSTED') result = 'LOSE';
    else if (dealer > 21 || player > dealer) result = 'WIN';
    else if (player === dealer) result = 'PUSH';
    else result = 'LOSE';

    const payout =
      result === 'BLACKJACK'
        ? hand.bet + (hand.bet * num) / den
        : result === 'WIN'
          ? hand.bet * 2n
          : result === 'PUSH'
            ? hand.bet
            : 0n;
    return { hand: i, result, payout };
  });

  const insurancePayout =
    state.insurance.bet !== null && dealerNatural ? state.insurance.bet * 3n : 0n;
  const payout = hands.reduce((sum, h) => sum + h.payout, 0n) + insurancePayout;
  return {
    hands: hands.map((h) => ({ ...h, payout: h.payout.toString() })),
    insurancePayout: insurancePayout.toString(),
    totalBet: state.totalBet.toString(),
    payout: payout.toString(),
  };
}

function validateBet(bet: bigint): void {
  if (typeof bet !== 'bigint' || bet <= 0n || bet % 2n !== 0n) {
    // Even bets keep 3:2 blackjack payouts and half-bet insurance in whole chips.
    throw new IllegalActionError('INVALID_BET', 'bet must be a positive, even number of chips');
  }
}

export function init(
  config: BlackjackConfig,
  rng: Rng,
): StepResult<BlackjackState, BlackjackEvent> {
  validateBet(config.bet);
  const rules = rulesFor(config.rulesVersion ?? BLACKJACK_RULES_V1.version);
  const round = Round.start(config.bet, rules, rng);

  round.dealToPlayer(0);
  round.dealToDealer(false);
  round.dealToPlayer(0);
  round.dealToDealer(true); // hole card

  if (rules.insurance && rankOf(round.state.dealer.cards[0] as Card) === 'A') {
    round.emit({ type: 'INSURANCE_OFFERED', payload: {} });
  } else {
    afterInsurance(round);
  }
  return { state: round.state, events: round.events };
}

export function applyAction(
  state: BlackjackState,
  action: BlackjackAction,
  rng: Rng,
): StepResult<BlackjackState, BlackjackEvent> {
  if (state.phase === 'SETTLED') throw new IllegalActionError('ROUND_SETTLED', 'round is over');
  const rules = rulesFor(state.rulesVersion);
  const shoe = newShoe(rules, rng);
  shoe.skip(state.cardsDealt);
  const round = new Round(state, rules, shoe);

  if (state.phase === 'INSURANCE') {
    if (action.type !== 'INSURANCE') {
      throw new IllegalActionError('INSURANCE_PENDING', 'decide on insurance first');
    }
    round.emit({
      type: 'INSURANCE_DECIDED',
      payload: { take: action.take, amount: actionCost(state, action).toString() },
    });
    afterInsurance(round);
    return { state: round.state, events: round.events };
  }

  const hand = state.activeHand;
  switch (action.type) {
    case 'INSURANCE':
      throw new IllegalActionError('INSURANCE_NOT_OFFERED', 'insurance is not available now');
    case 'HIT':
      round.emit({ type: 'HAND_HIT', payload: { hand } });
      round.dealToPlayer(hand);
      break;
    case 'STAND':
      round.emit({ type: 'HAND_STOOD', payload: { hand } });
      break;
    case 'DOUBLE':
      if (!canDouble(state)) throw new IllegalActionError('CANNOT_DOUBLE', 'cannot double now');
      round.emit({
        type: 'HAND_DOUBLED',
        payload: { hand, additionalBet: actionCost(state, action).toString() },
      });
      round.dealToPlayer(hand);
      break;
    case 'SPLIT':
      if (!canSplit(state)) throw new IllegalActionError('CANNOT_SPLIT', 'cannot split now');
      round.emit({
        type: 'HAND_SPLIT',
        payload: { hand, newHand: hand + 1, additionalBet: actionCost(state, action).toString() },
      });
      round.dealToPlayer(hand);
      round.dealToPlayer(hand + 1);
      break;
    default:
      throw new IllegalActionError('UNKNOWN_ACTION', 'unknown action');
  }
  advance(round);
  return { state: round.state, events: round.events };
}

export function settle(state: BlackjackState): Settlement {
  if (state.status !== 'SETTLED' || state.payout === null) {
    throw new Error('round is not settled yet');
  }
  return { bet: state.totalBet, payout: state.payout };
}

export const blackjack: Game<BlackjackConfig, BlackjackState, BlackjackAction, BlackjackEvent> = {
  id: 'blackjack',
  init,
  applyAction,
  replay: (_config, events) => replayEvents(events),
  settle,
};
