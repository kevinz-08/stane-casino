import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppConfig } from '../../config/app-config';

const CREDENTIAL_ROUTE = 'rateLimit:credentialRoute';

/**
 * Marks a route that accepts credentials (login, register). Besides the global limit, these get
 * the much stricter `auth` throttler to slow down credential stuffing and account farming.
 */
export const CredentialRoute = () => SetMetadata(CREDENTIAL_ROUTE, true);

function isCredentialRoute(context: ExecutionContext): boolean {
  return Reflect.getMetadata(CREDENTIAL_ROUTE, context.getHandler()) === true;
}

export function throttlerOptions(config: AppConfig): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: 'default', ttl: config.rateLimit.windowMs, limit: config.rateLimit.limit },
      {
        name: 'auth',
        ttl: config.rateLimit.windowMs,
        limit: config.rateLimit.authLimit,
        skipIf: (context) => !isCredentialRoute(context),
      },
    ],
    errorMessage: 'Too many requests, slow down',
  };
}
