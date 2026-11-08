/**
 * Source of randomness consumed by games. The ONLY allowed randomness inside the engine.
 * Production impl will be derived from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  nextFloat(): number;
  /** Uniform integer in [0, maxExclusive) with no modulo bias. */
  nextInt(maxExclusive: number): number;
}

// TODO(phase-2): HMAC-SHA256 based Rng + unbiased integer mapping (rejection sampling)
// TODO(phase-2): Fisher-Yates shuffle driven by Rng
