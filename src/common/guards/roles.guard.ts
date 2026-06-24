import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { I18nHttpException } from '../filters/i18n-http.exception';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/modules/users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get the required roles from the decorator
    const requiredRoles = this.reflector.get<UserRole[]>(
      ROLES_KEY,
      context.getHandler(),
    );
    if (!requiredRoles) return true;

    // Get the user from the request
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!requiredRoles.includes(user.role)) {
      throw new I18nHttpException(HttpStatus.FORBIDDEN, 'common.forbidden', {
        roles: requiredRoles.join(', '),
      });
    }

    return true;
  }
}
