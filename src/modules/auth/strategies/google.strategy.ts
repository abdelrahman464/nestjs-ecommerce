import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('googleAuth.clientId');
    const clientSecret = config.get<string>('googleAuth.clientSecret');
    const callbackURL = config.get<string>('googleAuth.callbackURL');

    // passport-google-oauth20 throws a cryptic error if clientID is missing.
    // That usually means the wrong .env file was loaded (e.g. start:prod → .env.production).
    if (!clientID || !clientSecret) {
      const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
      throw new Error(
        `Google OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). ` +
          `Nest loads "${envFile}" for NODE_ENV=${process.env.NODE_ENV || 'development'}. ` +
          `Add the keys there, or use "npm run start:dev" (loads .env.development).`,
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails } = profile;
    const user = {
      googleId: id,
      email: emails[0].value,
      name: name.givenName + ' ' + name.familyName,
      accessToken,
    };
    done(null, user);
  }
}
