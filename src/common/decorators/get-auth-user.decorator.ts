import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Returns the full authenticated user (`id`, `email`, `role`) from {@link JwtAuthGuard}.
 * Undefined only on unauthenticated requests (e.g. incorrectly marked public).
 */
export const GetAuthUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return req.user;
  },
);
