import { Controller, Get, Query } from '@nestjs/common';
import type { RoundHistoryDto } from '@casino/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/auth.decorators';
import { HistoryQueryDto } from '../wallet/wallet.dto';
import { RoundsService } from './rounds.service';

@Controller('rounds')
export class RoundsController {
  constructor(private readonly roundsService: RoundsService) {}

  /** The player's rounds, newest first. Details and verification: `/blackjack/rounds/:id`. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HistoryQueryDto,
  ): Promise<RoundHistoryDto> {
    return this.roundsService.list(user.sub, { cursor: query.cursor, limit: query.limit });
  }
}
