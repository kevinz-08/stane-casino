import {
  type BlackjackActionType,
  type BlackjackEvent,
  type BlackjackPlayerView,
  type Card,
  type HandResult,
  type HandStatus,
  handValue,
  type Phase,
  rankOf,
} from '@casino/game-engine';

/**
 * What the table shows. It is advanced event by event while animating, but the server's
 * `view` is the authority: once the animation queue drains, the scene is checked against
 * `sceneFromView(view)` and replaced if anything differs (see `use-event-player.ts`).
 */
export interface SceneCard {
  /** Stable identity for React/Motion (`c<shoe position>` when known). */
  key: string;
  /** `null` = face down and unknown to the client (the dealer's hole card). */
  card: Card | null;
  faceUp: boolean;
  /** Dealt during the current animation: it flies in from the shoe. */
  fresh: boolean;
}

export interface SceneHand {
  cards: SceneCard[];
  bet: string;
  doubled: boolean;
  fromSplit: boolean;
  status: HandStatus;
  result: HandResult | null;
  payout: string | null;
  total: number;
  soft: boolean;
}

export interface Scene {
  phase: Phase;
  dealer: { cards: SceneCard[]; total: number | null; holeRevealed: boolean };
  hands: SceneHand[];
  activeHand: number;
  insurance: { offered: boolean; bet: string | null };
  totalBet: string;
  payout: string | null;
  /** Only meaningful once the queue has drained (taken from the server view). */
  allowedActions: BlackjackActionType[];
}

function total(cards: SceneCard[]) {
  const known = cards.filter((c) => c.faceUp && c.card).map((c) => c.card as Card);
  return known.length > 0 ? handValue(known) : null;
}

function withTotals(hand: Omit<SceneHand, 'total' | 'soft'>): SceneHand {
  const value = total(hand.cards) ?? { total: 0, soft: false };
  return { ...hand, total: value.total, soft: value.soft };
}

function dealerWithTotal(dealer: Omit<Scene['dealer'], 'total'>): Scene['dealer'] {
  return { ...dealer, total: total(dealer.cards)?.total ?? null };
}

/** Authoritative scene, straight from the server's view (no animation). */
export function sceneFromView(view: BlackjackPlayerView): Scene {
  return {
    phase: view.phase,
    dealer: {
      cards: view.dealer.cards.map((card, i) => ({
        key: `v-d${i}`,
        card,
        faceUp: card !== null,
        fresh: false,
      })),
      total: view.dealer.total,
      holeRevealed: view.dealer.holeRevealed,
    },
    hands: view.hands.map((hand, h) => ({
      cards: hand.cards.map((card, i) => ({
        key: `v-h${h}-${i}`,
        card,
        faceUp: true,
        fresh: false,
      })),
      bet: hand.bet,
      doubled: hand.doubled,
      fromSplit: hand.fromSplit,
      status: hand.status,
      result: hand.result,
      payout: hand.payout,
      total: hand.total,
      soft: hand.soft,
    })),
    activeHand: view.activeHand,
    insurance: { ...view.insurance },
    totalBet: view.totalBet,
    payout: view.payout,
    allowedActions: [...view.allowedActions],
  };
}

const add = (a: string, b: string) => (BigInt(a) + BigInt(b)).toString();

/** Hand status after a card, mirroring the engine's rules (bust, 21, double, split ace). */
function statusAfterCard(hand: SceneHand, cards: SceneCard[]): HandStatus {
  const t = total(cards)?.total ?? 0;
  const splitAces = hand.fromSplit && hand.cards[0]?.card && rankOf(hand.cards[0].card) === 'A';
  if (t > 21) return 'BUSTED';
  if (t === 21 || hand.doubled || (splitAces && cards.length >= 2)) return 'STOOD';
  return hand.status;
}

/** Advances the scene by one (player-safe, possibly redacted) event. */
export function applyEvent(scene: Scene | null, event: BlackjackEvent): Scene {
  if (event.type === 'ROUND_STARTED') {
    return {
      phase: 'PLAYER',
      dealer: { cards: [], total: null, holeRevealed: false },
      hands: [
        withTotals({
          cards: [],
          bet: event.payload.bet,
          doubled: false,
          fromSplit: false,
          status: 'PLAYING',
          result: null,
          payout: null,
        }),
      ],
      activeHand: 0,
      insurance: { offered: false, bet: null },
      totalBet: event.payload.bet,
      payout: null,
      allowedActions: [],
    };
  }
  if (!scene) throw new Error('scene: first event must be ROUND_STARTED');
  const s: Scene = { ...scene, allowedActions: [] };

  switch (event.type) {
    case 'CARD_DEALT': {
      const faceUp = event.payload.to === 'PLAYER' || !event.payload.faceDown;
      const sceneCard: SceneCard = {
        key: `c${event.payload.position}`,
        // A face-down card never carries its value, even when the same response also reveals
        // it: the face only exists on the page from HOLE_CARD_REVEALED on.
        card: faceUp ? event.payload.card : null,
        faceUp,
        fresh: true,
      };
      if (event.payload.to === 'DEALER') {
        s.dealer = dealerWithTotal({ ...s.dealer, cards: [...s.dealer.cards, sceneCard] });
      } else {
        const index = event.payload.hand;
        const hand = s.hands[index] as SceneHand;
        const cards = [...hand.cards, sceneCard];
        s.hands = s.hands.map((h, i) =>
          i === index ? withTotals({ ...hand, cards, status: statusAfterCard(hand, cards) }) : h,
        );
      }
      return s;
    }
    case 'INSURANCE_OFFERED':
      return { ...s, phase: 'INSURANCE', insurance: { offered: true, bet: null } };
    case 'INSURANCE_DECIDED':
      return {
        ...s,
        phase: 'PLAYER',
        insurance: { offered: true, bet: event.payload.take ? event.payload.amount : null },
        totalBet: event.payload.take ? add(s.totalBet, event.payload.amount) : s.totalBet,
      };
    case 'HAND_STOOD':
      s.hands = s.hands.map((h, i) => (i === event.payload.hand ? { ...h, status: 'STOOD' } : h));
      return s;
    case 'HAND_DOUBLED':
      s.hands = s.hands.map((h, i) =>
        i === event.payload.hand
          ? { ...h, bet: add(h.bet, event.payload.additionalBet), doubled: true }
          : h,
      );
      return { ...s, totalBet: add(s.totalBet, event.payload.additionalBet) };
    case 'HAND_SPLIT': {
      const hand = s.hands[event.payload.hand] as SceneHand;
      const [first, second] = hand.cards as [SceneCard, SceneCard];
      const base = {
        doubled: false,
        fromSplit: true,
        status: 'PLAYING' as const,
        result: null,
        payout: null,
      };
      const hands = [...s.hands];
      hands.splice(
        event.payload.hand,
        1,
        withTotals({ ...base, cards: [{ ...first, fresh: false }], bet: hand.bet }),
      );
      hands.splice(
        event.payload.newHand,
        0,
        withTotals({
          ...base,
          cards: [{ ...second, fresh: false }],
          bet: event.payload.additionalBet,
        }),
      );
      return { ...s, hands, totalBet: add(s.totalBet, event.payload.additionalBet) };
    }
    case 'ACTIVE_HAND_CHANGED':
      return { ...s, activeHand: event.payload.hand };
    case 'HOLE_CARD_REVEALED': {
      const cards = s.dealer.cards.map((c, i) =>
        i === 1 ? { ...c, card: event.payload.card, faceUp: true } : c,
      );
      return { ...s, dealer: dealerWithTotal({ cards, holeRevealed: true }) };
    }
    case 'ROUND_SETTLED': {
      const results = new Map(event.payload.hands.map((h) => [h.hand, h]));
      return {
        ...s,
        phase: 'SETTLED',
        payout: event.payload.payout,
        hands: s.hands.map((h, i) => ({
          ...h,
          status: h.status === 'PLAYING' ? 'STOOD' : h.status,
          result: results.get(i)?.result ?? null,
          payout: results.get(i)?.payout ?? null,
        })),
      };
    }
    default:
      return s; // HAND_HIT, DEALER_PEEKED: no visible state of their own
  }
}

/** Everything visible, without animation bookkeeping (keys, `fresh`): for equality checks. */
export function sceneSignature(scene: Scene): string {
  const cards = (cs: SceneCard[]) => cs.map((c) => (c.faceUp ? c.card : 'back'));
  return JSON.stringify({
    phase: scene.phase,
    dealer: { cards: cards(scene.dealer.cards), total: scene.dealer.total },
    hands: scene.hands.map((h) => ({ ...h, cards: cards(h.cards) })),
    activeHand: scene.activeHand,
    insurance: scene.insurance,
    totalBet: scene.totalBet,
    payout: scene.payout,
  });
}

/** Marks every card as already on the table (no fly-in when re-rendered). */
export function settleCards(scene: Scene): Scene {
  const calm = (c: SceneCard) => (c.fresh ? { ...c, fresh: false } : c);
  return {
    ...scene,
    dealer: { ...scene.dealer, cards: scene.dealer.cards.map(calm) },
    hands: scene.hands.map((h) => ({ ...h, cards: h.cards.map(calm) })),
  };
}
