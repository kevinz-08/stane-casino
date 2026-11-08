import { verifyCommitment } from '../fairness';
import { createHmacRng } from '../rng';
import { applyAction, init, replayEvents } from './engine';
import type { BlackjackAction, BlackjackEvent, BlackjackState } from './types';

export interface BlackjackVerificationInput {
  serverSeed: string;
  /** Commitment published before the round was played. */
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  /** Events as stored by the server, in seq order. */
  events: readonly BlackjackEvent[];
}

export interface BlackjackVerification {
  /** Everything checks out. */
  ok: boolean;
  /** SHA-256(serverSeed) equals the published hash. */
  commitmentValid: boolean;
  /** Re-dealing from the seeds and re-applying the player's decisions reproduces every event. */
  eventsReproduced: boolean;
  /** First stored event that the recomputation does not reproduce. */
  mismatch: { seq: number; expected: unknown; actual: unknown } | null;
  /** Round rebuilt from the recomputed events. */
  state: BlackjackState | null;
}

/** Turns a stored player-decision event back into the action that produced it. */
function decisionOf(event: BlackjackEvent): BlackjackAction | null {
  switch (event.type) {
    case 'INSURANCE_DECIDED':
      return { type: 'INSURANCE', take: event.payload.take };
    case 'HAND_HIT':
      return { type: 'HIT' };
    case 'HAND_STOOD':
      return { type: 'STAND' };
    case 'HAND_DOUBLED':
      return { type: 'DOUBLE' };
    case 'HAND_SPLIT':
      return { type: 'SPLIT' };
    default:
      return null;
  }
}

/** Structural equality that ignores key order (PostgreSQL `jsonb` reorders object keys). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Public verifier: needs only what the player can see after the seed pair is rotated.
 * Nothing in here trusts the server: the deal is recomputed from the seeds.
 */
export function verifyBlackjackRound(input: BlackjackVerificationInput): BlackjackVerification {
  const commitmentValid = verifyCommitment(input.serverSeed, input.serverSeedHash);
  const started = input.events[0];
  if (!started || started.type !== 'ROUND_STARTED') {
    return {
      ok: false,
      commitmentValid,
      eventsReproduced: false,
      mismatch: { seq: 0, expected: 'ROUND_STARTED', actual: started ?? null },
      state: null,
    };
  }

  const rng = () => createHmacRng(input);
  const recomputed: BlackjackEvent[] = [];
  try {
    const first = init(
      { bet: BigInt(started.payload.bet), rulesVersion: started.payload.rulesVersion },
      rng(),
    );
    recomputed.push(...first.events);
    let state = first.state;
    while (recomputed.length < input.events.length && state.phase !== 'SETTLED') {
      const action = decisionOf(input.events[recomputed.length] as BlackjackEvent);
      if (!action) break; // the server claims an automatic event we did not produce
      const step = applyAction(state, action, rng());
      recomputed.push(...step.events);
      state = step.state;
    }
  } catch {
    // An illegal decision in the stored log is itself a mismatch, reported below.
  }

  const length = Math.max(recomputed.length, input.events.length);
  for (let i = 0; i < length; i++) {
    if (!deepEqual(recomputed[i], input.events[i])) {
      return {
        ok: false,
        commitmentValid,
        eventsReproduced: false,
        mismatch: { seq: i, expected: recomputed[i] ?? null, actual: input.events[i] ?? null },
        state: recomputed.length > 0 ? replayEvents(recomputed) : null,
      };
    }
  }
  return {
    ok: commitmentValid,
    commitmentValid,
    eventsReproduced: true,
    mismatch: null,
    state: replayEvents(recomputed),
  };
}
