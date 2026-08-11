import * as jwt from 'jsonwebtoken';
import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { I18nHttpException } from '../filters/i18n-http.exception';
import { ConfigService } from '@nestjs/config';
import JwtPayload from '../types/jwtPayload.interface';
import { UserDocument } from '../../modules/users/schemas/user.schema';

@Injectable()
export class TokenService {
  constructor(@Inject(ConfigService) private config: ConfigService) {}

  createPayload(
    user: UserDocument,
  ): Pick<JwtPayload, 'id' | 'email' | 'sv'> {
    return {
      id: user._id,
      email: user.email,
      sv: user.sessionVersion ?? 0,
    };
  }

  generateAccessToken(
    payload: Pick<JwtPayload, 'id' | 'email' | 'sv'>,
  ): string {
    return jwt.sign(payload, this.config.get<string>('jwt.secret'), {
      expiresIn: (this.config.get<string>('jwt.expire') ||
        '15m') as jwt.SignOptions['expiresIn'],
    });
  }

  generateRefreshToken(
    payload: Pick<JwtPayload, 'id' | 'email' | 'sv' | 'sid'>,
  ): string {
    return jwt.sign(payload, this.config.get<string>('jwt.refreshSecret'), {
      expiresIn: (this.config.get<string>('jwt.refreshExpire') ||
        '30d') as jwt.SignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.verify(token, this.config.get<string>('jwt.secret'));
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.verify(token, this.config.get<string>('jwt.refreshSecret'));
  }

  private verify(token: string, secret: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === 'string') {
        throw new Error('Invalid token payload');
      }
      return decoded as JwtPayload;
    } catch {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.invalidOrExpiredToken',
      );
    }
  }
}
