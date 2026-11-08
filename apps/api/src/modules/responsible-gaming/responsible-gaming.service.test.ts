import { describe, expect, it, vi } from 'vitest';
import { ResponsibleGamingService } from './responsible-gaming.service';
import { BetRejectedError } from './responsible-gaming.types';

const check = { userId: 'u1', game: 'BLACKJACK' as const, amount: 10n };

describe('ResponsibleGamingService (phase 1: minimal canBet)', () => {
  it('allows every bet for now', async () => {
    await expect(new ResponsibleGamingService().canBet(check)).resolves.toEqual({ allowed: true });
    await expect(new ResponsibleGamingService().assertCanBet(check)).resolves.toBeUndefined();
  });

  it('assertCanBet turns a veto into a BET_REJECTED domain error', async () => {
    const service = new ResponsibleGamingService();
    vi.spyOn(service, 'canBet').mockResolvedValue({
      allowed: false,
      reason: 'SELF_EXCLUDED',
      message: 'You are self-excluded until 2027-01-01',
    });

    const error = await service.assertCanBet(check).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BetRejectedError);
    expect(error).toMatchObject({ code: 'BET_REJECTED', httpStatus: 403, reason: 'SELF_EXCLUDED' });
  });
});
