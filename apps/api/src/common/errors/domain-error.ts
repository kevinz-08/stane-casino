/**
 * Base class for expected business failures (insufficient funds, idempotency conflicts...).
 * Services throw these instead of HTTP exceptions so they stay transport-agnostic (HTTP today,
 * WebSocket gateways in phase 3); the global exception filter maps them to responses.
 */
export abstract class DomainError extends Error {
  /** Stable, machine-readable code sent to clients. */
  abstract readonly code: string;
  /** HTTP status the error maps to. */
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
