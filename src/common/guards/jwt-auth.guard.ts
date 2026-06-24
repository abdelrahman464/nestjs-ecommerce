import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { I18nHttpException } from '../filters/i18n-http.exception';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../modules/users/schemas/user.schema';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../tokens/token.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);

    let decoded;
    try {
      decoded = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.invalidOrExpiredToken',
      );
    }

    const currentUser = await this.userModel
      .findById(decoded.id)
      .select('+passwordChangedAt');

    if (!currentUser) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.userTokenInvalid',
      );
    }

    if (currentUser.passwordChangedAt) {
      const changedAt = Math.floor(
        currentUser.passwordChangedAt.getTime() / 1000,
      );
      if (changedAt > decoded.iat) {
        throw new I18nHttpException(
          HttpStatus.UNAUTHORIZED,
          'auth.passwordChanged',
        );
      }
    }

    (req as Request & { user: AuthenticatedUser }).user = {
      id: currentUser._id.toString(),
      email: currentUser.email,
      role: currentUser.role,
    };

    return true;
  }

  private extractToken(req: Request): string {
    const header = req.headers['authorization'];
    if (header) {
      const [bearer, token] = (header as string).split(' ');
      if (bearer === 'Bearer' && token) return token;
    }

    const cookieToken = req.cookies?.accessToken;
    if (cookieToken) return cookieToken;

    throw new I18nHttpException(
      HttpStatus.UNAUTHORIZED,
      'auth.noTokenProvided',
    );
  }
}
