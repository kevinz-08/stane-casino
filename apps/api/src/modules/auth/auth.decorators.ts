import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@casino/shared';

/** Identity attached to the request by `JwtAuthGuard` (from the access token claims). */
export interface AuthenticatedUser {
  /** User id. */
  sub: string;
  role: UserRole;
}

export const IS_PUBLIC = 'auth:isPublic';
export const REQUIRED_ROLES = 'auth:roles';

/** Opt a route out of the global JWT guard. Every other route requires a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a route to the given roles (checked after authentication). */
export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles);

/** Injects the authenticated user into a controller method. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new Error('CurrentUser used on a route without authentication');
    return req.user;
  },
);
