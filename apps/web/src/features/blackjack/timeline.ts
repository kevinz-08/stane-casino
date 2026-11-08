import type { BlackjackEvent } from '@casino/game-engine';
import type { SoundName } from '@/lib/sound';
import { CARD_LANDED_MS, PACING } from './pacing';
import type { Scene } from './scene';

export type DealerGesture = 'idle' | 'deal' | 'peek' | 'reveal' | 'pay' | 'collect';
export type DealerMood = 'neutral' | 'happy' | 'surprised' | 'sorry' | 'focused';

export interface DealerReaction {
  gesture: DealerGesture;
  mood: DealerMood;
  /** Speech bubble, or null to keep quiet. */
  line: string | null;
}

export interface Step {
  /** How long this event stays on screen before the next one, at normal speed. */
  durationMs: number;
  sound: SoundName | null;
  /** A second sound later in the step (e.g. the card flipping once it has landed). */
  followUp?: { sound: SoundName; afterMs: number };
  dealer: DealerReaction | null;
  /** Celebrate (confetti) after this step. */
  celebrate?: boolean;
  vibrate?: number | number[];
}

/** Picks a line deterministically from the event (variety without affecting anything). */
function pick(lines: string[], seq: number): string {
  return lines[seq % lines.length] as string;
}

/**
 * Staging of every engine event. Pure: given the event and the scene AFTER applying it.
 * The outcome was decided by the server; this only decides how it is shown.
 */
export function stepFor(event: BlackjackEvent, after: Scene): Step {
  switch (event.type) {
    case 'ROUND_STARTED':
      return {
        durationMs: 800,
        sound: 'chips',
        dealer: {
          gesture: 'idle',
          mood: 'neutral',
          line: pick(['¡Suerte!', 'Allá vamos.', 'Buena apuesta.'], event.seq),
        },
      };
    case 'CARD_DEALT':
      return cardStep(event, after);
    case 'INSURANCE_OFFERED':
      return {
        durationMs: 700,
        sound: null,
        dealer: { gesture: 'idle', mood: 'neutral', line: 'Tengo un as. ¿Seguro?' },
      };
    case 'INSURANCE_DECIDED':
      return {
        durationMs: 600,
        sound: event.payload.take ? 'chip' : null,
        dealer: {
          gesture: 'idle',
          mood: 'neutral',
          line: event.payload.take ? 'Seguro anotado.' : 'Sin seguro.',
        },
      };
    case 'DEALER_PEEKED':
      return {
        durationMs: 1500,
        sound: null,
        dealer: event.payload.blackjack
          ? { gesture: 'peek', mood: 'surprised', line: 'Uy… ¡blackjack de la casa!' }
          : { gesture: 'peek', mood: 'neutral', line: 'Nada por aquí.' },
      };
    case 'HAND_HIT':
      return {
        durationMs: 200,
        sound: null,
        dealer: {
          gesture: 'idle',
          mood: 'neutral',
          line: pick(['Carta.', 'Marchando.', 'Ahí va.'], event.seq),
        },
      };
    case 'HAND_STOOD':
      return {
        durationMs: 500,
        sound: null,
        dealer: {
          gesture: 'idle',
          mood: 'neutral',
          line: pick(['Te plantas.', 'Muy bien.'], event.seq),
        },
      };
    case 'HAND_DOUBLED':
      return {
        durationMs: 700,
        sound: 'chips',
        dealer: { gesture: 'idle', mood: 'surprised', line: '¡Doblas! Una carta más.' },
      };
    case 'HAND_SPLIT':
      return {
        durationMs: 900,
        sound: 'chips',
        dealer: { gesture: 'idle', mood: 'neutral', line: 'Separamos.' },
      };
    case 'ACTIVE_HAND_CHANGED':
      return {
        durationMs: 600,
        sound: null,
        dealer: { gesture: 'idle', mood: 'neutral', line: `Mano ${event.payload.hand + 1}.` },
      };
    case 'HOLE_CARD_REVEALED':
      // A beat of suspense, the card turns, then a pause to read it.
      return {
        durationMs: (PACING.revealPause + PACING.revealFlip) * 1000 + 700,
        sound: null,
        followUp: { sound: 'flip', afterMs: PACING.revealPause * 1000 },
        dealer: { gesture: 'reveal', mood: 'focused', line: null },
      };
    case 'ROUND_SETTLED':
      return settledStep(event, after);
  }
}

function cardStep(event: Extract<BlackjackEvent, { type: 'CARD_DEALT' }>, after: Scene): Step {
  const faceDown = event.payload.to === 'DEALER' && event.payload.faceDown;
  const landed = faceDown
    ? (PACING.flight + PACING.beat) * 1000
    : CARD_LANDED_MS + PACING.beat * 1000;
  const base: Step = {
    durationMs: landed,
    sound: 'deal',
    followUp: faceDown ? undefined : { sound: 'flip', afterMs: PACING.flight * 1000 },
    dealer: { gesture: 'deal', mood: 'focused', line: null },
  };

  // A bust deserves a moment: the card lands, then the table reacts.
  if (event.payload.to === 'PLAYER' && after.hands[event.payload.hand]?.status === 'BUSTED') {
    return {
      ...base,
      durationMs: landed + 900,
      dealer: { gesture: 'collect', mood: 'sorry', line: '¡Te pasas!' },
      vibrate: 60,
    };
  }
  if (event.payload.to === 'DEALER' && (after.dealer.total ?? 0) > 21) {
    return {
      ...base,
      durationMs: landed + 700,
      dealer: { gesture: 'deal', mood: 'surprised', line: '¡Me paso!' },
    };
  }
  return base;
}

function settledStep(
  event: Extract<BlackjackEvent, { type: 'ROUND_SETTLED' }>,
  after: Scene,
): Step {
  const results = event.payload.hands.map((h) => h.result);
  const net = BigInt(event.payload.payout) - BigInt(event.payload.totalBet);
  const dealerBust = (after.dealer.total ?? 0) > 21;

  if (results.includes('BLACKJACK')) {
    return {
      durationMs: 1800,
      sound: 'blackjack',
      dealer: { gesture: 'pay', mood: 'happy', line: '¡Blackjack! Paga 3 a 2.' },
      celebrate: true,
      vibrate: [40, 60, 40],
    };
  }
  if (net > 0n) {
    return {
      durationMs: 1500,
      sound: 'win',
      dealer: {
        gesture: 'pay',
        mood: dealerBust ? 'sorry' : 'happy',
        line: dealerBust
          ? 'Me paso… ¡ganas tú!'
          : pick(['¡Enhorabuena!', 'Bien jugado.', 'Para ti.'], event.seq),
      },
      vibrate: 30,
    };
  }
  if (net === 0n) {
    return {
      durationMs: 1300,
      sound: 'push',
      dealer: { gesture: 'idle', mood: 'neutral', line: 'Empate. Recuperas tu apuesta.' },
    };
  }
  return {
    durationMs: 1400,
    sound: 'lose',
    dealer: {
      gesture: 'collect',
      mood: 'sorry',
      line:
        results.every((r) => r === 'LOSE') && after.hands.every((h) => h.status === 'BUSTED')
          ? 'Te pasaste. La próxima.'
          : pick(['Esta vez gana la casa.', 'Mala suerte.', 'La próxima es tuya.'], event.seq),
    },
  };
}
