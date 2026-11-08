import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';

export class InvalidBetError extends DomainError {
  readonly code = 'INVALID_BET';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}

export class RoundInProgressError extends DomainError {
  readonly code = 'ROUND_IN_PROGRESS';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('You already have a blackjack round in progress');
  }
}

export class RoundSettledError extends DomainError {
  readonly code = 'ROUND_SETTLED';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('This round is already over');
  }
}

/** The client acted on an outdated view (double click, retried request, second tab). */
export class RoundVersionMismatchError extends DomainError {
  readonly code = 'ROUND_VERSION_MISMATCH';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`The round changed (version ${actual}, you sent ${expected}): reload it`);
  }
}

export class IllegalMoveError extends DomainError {
  readonly code = 'ILLEGAL_ACTION';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}

export class StartKeyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('Idempotency key was already used to start a different round');
  }
}
