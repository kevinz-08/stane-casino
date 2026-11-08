import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  CLIENT_SEED_PATTERN,
  type RotateSeedsRequestDto,
  type RotateSeedsResponseDto,
  type SeedsDto,
} from '@casino/shared';
import { IsOptional, Matches } from 'class-validator';
import { type AuthenticatedUser, CurrentUser } from '../auth/auth.decorators';
import { FairnessService } from './fairness.service';

class RotateSeedsDto implements RotateSeedsRequestDto {
  @IsOptional()
  @Matches(CLIENT_SEED_PATTERN, {
    message: 'clientSeed must be 1-64 characters: letters, digits, _ . : -',
  })
  clientSeed?: string;
}

@Controller('fairness')
export class FairnessController {
  constructor(private readonly fairnessService: FairnessService) {}

  /** Active commitment (hash only) and every revealed pair. */
  @Get('seeds')
  seeds(@CurrentUser() user: AuthenticatedUser): Promise<SeedsDto> {
    return this.fairnessService.listPairs(user.sub);
  }

  /**
   * Reveals the current server seed (so its rounds can be verified) and starts a new pair.
   * Changing the client seed always goes through here (ADR-003).
   */
  @Post('rotate')
  @HttpCode(HttpStatus.OK)
  rotate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RotateSeedsDto,
  ): Promise<RotateSeedsResponseDto> {
    return this.fairnessService.rotate(user.sub, dto.clientSeed);
  }
}
