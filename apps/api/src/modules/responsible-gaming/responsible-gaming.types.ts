import { HttpStatus } from '@nestjs/common';
import type { GameType } from '@casino/shared';
import { DomainError } from '../../common/errors/domain-error';

/** What a game asks before taking a stake. */
export interface BetCheck {
  userId: string;
  game: GameType;
  /** Stake in chips (> 0). */
  amount: bigint;
}

/** Why a bet can be vetoed. Phase 1 never vetoes; phase 5a implements every reason. */
export type BetRejectionReason =
  | 'SELF_EXCLUDED'
  | 'COOLING_OFF'
  | 'WAGER_LIMIT_REACHED'
  | 'LOSS_LIMIT_REACHED'
  | 'SESSION_TIME_LIMIT_REACHED';

export type BetDecision =
  { allowed: true } | { allowed: false; reason: BetRejectionReason; message: string };

export class BetRejectedError extends DomainError {
  readonly code = 'BET_REJECTED';
  readonly httpStatus = HttpStatus.FORBIDDEN;
  constructor(
    readonly reason: BetRejectionReason,
    message: string,
  ) {
    super(message);
  }
}
