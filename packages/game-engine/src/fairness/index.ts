import { sha256, toHex, utf8 } from '../crypto';
import { createHmacRng, type Rng } from '../rng';

/** Inputs of the provably fair scheme. */
export interface FairnessParams {
  /** Secret until rotated; only its SHA-256 hash is published beforehand. */
  readonly serverSeed: string;
  readonly clientSeed: string;
  /** Increments once per round for a given seed pair. */
  readonly nonce: number;
}

/** Hash published to the player before playing (commitment to the serverSeed). */
export type ServerSeedCommitment = string;

export interface RngFactory {
  create(params: FairnessParams): Rng;
}

/** Version of the byte stream / mapping. Bump it if anything in `HmacRng` changes. */
export const FAIRNESS_SCHEME = 'hmac-sha256-v1';

/** `hex(SHA-256(utf8(serverSeed)))`. */
export function commitServerSeed(serverSeed: string): ServerSeedCommitment {
  return toHex(sha256(utf8(serverSeed)));
}

/** True when a revealed server seed matches the commitment published before play. */
export function verifyCommitment(serverSeed: string, commitment: ServerSeedCommitment): boolean {
  return commitServerSeed(serverSeed) === commitment.toLowerCase();
}

export const hmacRngFactory: RngFactory = { create: createHmacRng };
