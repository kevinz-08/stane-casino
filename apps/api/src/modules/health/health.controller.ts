import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_NAME } from '@casino/shared';
import type { HealthResponseDto } from '@casino/shared';
import { Public } from '../auth/auth.decorators';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponseDto {
    // TODO(fase-5): also ping PostgreSQL and Redis once the clients exist (readiness probe)
    return {
      status: 'ok',
      service: `${APP_NAME}-api`,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
