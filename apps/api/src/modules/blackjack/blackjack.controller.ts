import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { BlackjackAction, BlackjackPlayerView } from '@casino/game-engine';
import type {
  ActiveBlackjackRoundDto,
  BlackjackActionRequestDto,
  BlackjackActionTypeDto,
  StartBlackjackRequestDto,
} from '@casino/shared';
import { IsBoolean, IsIn, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';
import { type AuthenticatedUser, CurrentUser } from '../auth/auth.decorators';
import { type BlackjackRound, BlackjackService } from './blackjack.service';

const ACTIONS: BlackjackActionTypeDto[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'INSURANCE'];
const IDEMPOTENCY_KEY = /^[\w.:-]{8,100}$/;

class StartRoundDto implements StartBlackjackRequestDto {
  @Matches(/^\d{1,12}$/, { message: 'bet must be a whole number of chips, as a string' })
  bet!: string;
}

class ActionDto implements BlackjackActionRequestDto {
  @IsIn(ACTIONS)
  action!: BlackjackActionTypeDto;

  @ValidateIf((o: ActionDto) => o.action === 'INSURANCE')
  @IsBoolean({ message: 'take (boolean) is required for INSURANCE' })
  take?: boolean;

  @IsInt()
  @Min(0)
  @Max(10_000)
  version!: number;
}

@Controller('blackjack')
export class BlackjackController {
  constructor(private readonly blackjackService: BlackjackService) {}

  /**
   * Places the bet and deals. Requires an `Idempotency-Key` header: retrying with the same key
   * returns the same round instead of betting twice.
   */
  @Post('rounds')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartRoundDto,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<BlackjackRound> {
    if (!key || !IDEMPOTENCY_KEY.test(key)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Send an Idempotency-Key header (8-100 characters: letters, digits, _ . : -)',
      });
    }
    return this.blackjackService.start(user.sub, BigInt(dto.bet), key);
  }

  @Get('rounds/active')
  active(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActiveBlackjackRoundDto<BlackjackPlayerView>> {
    return this.blackjackService.getActive(user.sub);
  }

  @Get('rounds/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<BlackjackRound> {
    return this.blackjackService.get(user.sub, id);
  }

  @Post('rounds/:id/actions')
  @HttpCode(HttpStatus.OK)
  act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ActionDto,
  ): Promise<BlackjackRound> {
    const action: BlackjackAction =
      dto.action === 'INSURANCE'
        ? { type: 'INSURANCE', take: dto.take === true }
        : { type: dto.action };
    return this.blackjackService.act(user.sub, id, action, dto.version);
  }
}
