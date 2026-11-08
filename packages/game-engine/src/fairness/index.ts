import type { Rng } from '../rng';

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

// TODO(phase-2): sha256 commitment, HMAC-based RngFactory, public verifier function
