import { Injectable } from '@nestjs/common';
import { type BetCheck, type BetDecision, BetRejectedError } from './responsible-gaming.types';

/**
 * Single decision point for "may this player stake chips right now?" (see ARCHITECTURE.md).
 * Every game and every gateway must call `assertCanBet` before debiting a stake, so limits and
 * self-exclusion added in phase 5a apply everywhere without touching the games again.
 */
@Injectable()
export class ResponsibleGamingService {
  /**
   * Phase 1: minimal implementation, everything is allowed.
   * TODO(fase-5a): self-exclusion, cool-off, wager/loss/time limits (daily/weekly).
   */
  async canBet(_check: BetCheck): Promise<BetDecision> {
    return { allowed: true };
  }

  /** Throws `BetRejectedError` (HTTP 403, code `BET_REJECTED`) when the bet is vetoed. */
  async assertCanBet(check: BetCheck): Promise<void> {
    const decision = await this.canBet(check);
    if (!decision.allowed) throw new BetRejectedError(decision.reason, decision.message);
  }
}
