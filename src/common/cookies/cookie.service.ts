import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { parseExpireToMs } from '../utils/expire-to-ms.util';

@Injectable()
export class CookieService {
  constructor(private config: ConfigService) {}

  getBaseOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('jwt.cookieSecure') ?? false,
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const access = this.getAccessTokenCookie(accessToken);
    const refresh = this.getRefreshTokenCookie(refreshToken);
    res.cookie(access.name, access.value, access.options);
    res.cookie(refresh.name, refresh.value, refresh.options);
  }

  clearAuthCookies(res: Response): void {
    const options = this.getBaseOptions();
    res.clearCookie('accessToken', options);
    res.clearCookie('refreshToken', options);
  }

  private getAccessTokenCookie(token: string) {
    return {
      name: 'accessToken',
      value: token,
      options: {
        ...this.getBaseOptions(),
        maxAge: parseExpireToMs(
          this.config.get<string>('jwt.expire'),
          15 * 60 * 1000, // 15 minutes
        ),
      },
    };
  }

  private getRefreshTokenCookie(token: string) {
    return {
      name: 'refreshToken',
      value: token,
      options: {
        ...this.getBaseOptions(),
        maxAge: parseExpireToMs(
          this.config.get<string>('jwt.refreshExpire'),
          30 * 24 * 60 * 60 * 1000, // 30 days
        ),
      },
    };
  }
}
