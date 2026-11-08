import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
  constructor(
    readonly accountId: string,
    readonly balance: bigint,
    readonly requested: bigint,
  ) {
    super(`Insufficient funds: balance ${balance}, requested ${requested}`);
  }
}

/** The idempotency key was already used for a different operation. */
export class IdempotencyKeyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor(readonly idempotencyKey: string) {
    super('Idempotency key was already used with a different request');
  }
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'ACCOUNT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  constructor(readonly accountId: string) {
    super('Account not found');
  }
}

/** Programming error in the caller (bad amount, same account on both sides...). */
export class InvalidTransferError extends DomainError {
  readonly code = 'INVALID_TRANSFER';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
}
