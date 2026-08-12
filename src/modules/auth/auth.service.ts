import { Injectable, HttpStatus } from '@nestjs/common';
import { I18nHttpException } from 'src/common/filters/i18n-http.exception';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { UserRepository } from '../users/repository/users.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NotificationService } from '../notifications/notification.service';
import { EmailTemplateId } from '../notifications/templates/email-template-id.enum';
import { UserDocument } from '../users/schemas/user.schema';
import { Types } from 'mongoose';
import { TokenService } from 'src/common/tokens/token.service';
import { CookieService } from 'src/common/cookies/cookie.service';
import { HashService } from 'src/common/security/hash.service';
import { CryptoService } from 'src/common/security/crypto.service';
import { AuthSessionService } from './auth-session.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { extractClientMeta } from './utils/extract-client-meta.util';
import type { AuthSessionView } from './types/auth-session-meta.type';

@Injectable()
export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private notificationService: NotificationService,
    private tokenService: TokenService,
    private cookieService: CookieService,
    private hashService: HashService,
    private cryptoService: CryptoService,
    private authSessionService: AuthSessionService,
    private authPasswordResetService: AuthPasswordResetService,
  ) {}

  /** Create tokens, store refresh session in Redis, set httpOnly cookies. */
  private async signIn(
    user: UserDocument,
    req: Request,
    res: Response,
  ): Promise<UserDocument> {
    const userId = user._id.toString();
    const payload = this.tokenService.createPayload(user);
    const sid = await this.authSessionService.createSession(
      userId,
      extractClientMeta(req),
    );
    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken({
      ...payload,
      sid,
    });

    this.cookieService.setAuthCookies(res, accessToken, refreshToken);
    return user;
  }

  async register(
    dto: RegisterDto,
    req: Request,
    res: Response,
  ): Promise<UserDocument> {
    const exists = await this.userRepo.findUserByEmail(dto.email);
    if (exists) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'auth.emailInUse');
    }

    const user = await this.userRepo.createUser({
      name: dto.name,
      email: dto.email,
      password: await this.hashService.hash(dto.password),
    });

    return this.signIn(user, req, res);
  }

  async login(
    dto: LoginDto,
    req: Request,
    res: Response,
  ): Promise<UserDocument> {
    const user = await this.userRepo.findByEmailWithPassword(dto.email);
    if (!user) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.invalidCredentials',
      );
    }

    const valid = await this.hashService.compare(dto.password, user.password);
    if (!valid) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.invalidCredentials',
      );
    }

    return this.signIn(user, req, res);
  }

  async listSessions(req: Request, userId: string): Promise<AuthSessionView[]> {
    return this.authSessionService.listSessions(
      userId,
      this.readRefreshSid(req),
    );
  }

  async revokeSessionById(
    req: Request,
    res: Response,
    userId: string,
    sid: string,
  ): Promise<{ message: string }> {
    await this.authSessionService.revokeSession(sid, userId);

    // If the current session is the one being revoked, clear the cookies.
    const currentSid = this.readRefreshSid(req);
    if (currentSid && currentSid === sid) {
      this.cookieService.clearAuthCookies(res);
    }

    return { message: 'Session revoked' };
  }

  async refreshTokens(req: Request, res: Response): Promise<UserDocument> {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.noRefreshToken',
      );
    }

    let decoded;
    try {
      decoded = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.invalidRefreshToken',
      );
    }

    const user = await this.userRepo.findById(decoded.id);
    if (!user) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.userTokenInvalid',
      );
    }

    this.assertSessionVersion(user, decoded.sv);

    if (!decoded.sid) {
      throw new I18nHttpException(
        HttpStatus.FORBIDDEN,
        'auth.refreshTokenNotMatched',
      );
    }

    const sessionActive = await this.authSessionService.isSessionActive(
      decoded.sid,
      user._id.toString(),
    );
    if (!sessionActive) {
      throw new I18nHttpException(
        HttpStatus.FORBIDDEN,
        'auth.refreshTokenNotMatched',
      );
    }

    // Rotate: drop the old Redis session, issue a new one (fresh IP/UA meta).
    await this.authSessionService.revokeSession(
      decoded.sid,
      user._id.toString(),
    );
    return this.signIn(user, req, res);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      try {
        const decoded = this.tokenService.verifyRefreshToken(refreshToken);
        if (decoded.sid) {
          await this.authSessionService.revokeSession(
            decoded.sid,
            decoded.id.toString(),
          );
        }
      } catch {
        // Always clear cookies below.
      }
    }

    this.cookieService.clearAuthCookies(res);
  }

  /**
   * Logout every device: wipe Redis sessions, bump sessionVersion (kills access JWTs),
   * clear this browser's cookies. User must log in again.
   */
  async logoutAll(userId: string, res: Response): Promise<{ message: string }> {
    await this.authSessionService.revokeAllSessions(userId);
    await this.userRepo.bumpSessionVersion(userId);
    this.cookieService.clearAuthCookies(res);
    return { message: 'Logged out from all devices' };
  }

  // *TODO: refactor this function to use a object instead of multiple parameters
  async changePassword(
    userId: Types.ObjectId | string,
    dto: ChangePasswordDto,
    req: Request,
    res: Response,
  ): Promise<UserDocument> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new I18nHttpException(HttpStatus.UNAUTHORIZED, 'auth.userNotFound');
    }

    const match = await this.hashService.compare(
      dto.currentPassword,
      (user as UserDocument & { password: string }).password,
    );
    if (!match) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.wrongCurrentPassword',
      );
    }

    const revokeOthers = dto.revokeOtherSessions === true;
    const updatedUser = await this.userRepo.updatePassword(
      userId,
      await this.hashService.hash(dto.newPassword),
      // passwordChangedAt always; sessionVersion only when killing other devices.
      { bumpSessionVersion: revokeOthers },
    );

    const userIdStr = updatedUser._id.toString();
    const currentSid = this.readRefreshSid(req);

    if (revokeOthers) {
      // Logout every device, then this device gets a fresh session via signIn.
      await this.authSessionService.revokeAllSessions(userIdStr);
    } else if (currentSid) {
      // Only replace this device's old session; phone/laptop/tablet stay logged in.
      await this.authSessionService.revokeSession(currentSid, userIdStr);
    }

    return this.signIn(updatedUser, req, res);
  }

  /** Best-effort read of `sid` from the refresh cookie (used on password change). */
  private readRefreshSid(req: Request): string | undefined {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return undefined;
    try {
      return this.tokenService.verifyRefreshToken(refreshToken).sid;
    } catch {
      return undefined;
    }
  }

  async googleLogin(
    googleUser: {
      googleId: string;
      email: string;
      name: string;
      picture?: string;
    },
    req: Request,
    res: Response,
  ): Promise<UserDocument> {
    const user = await this.findOrCreateGoogleUser(googleUser);
    return this.signIn(user, req, res);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepo.findUserByEmail(dto.email);
    if (!user) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'auth.userNotFoundByEmail',
        { email: dto.email },
      );
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    await this.authPasswordResetService.saveCode(
      dto.email,
      this.cryptoService.createSha256Hash(resetCode),
    );

    await this.notificationService.sendEmail(
      dto.email,
      EmailTemplateId.PASSWORD_RESET,
      { name: user.name, code: resetCode },
    );

    return { message: 'Reset code sent to email' };
  }

  async verifyResetCode(dto: VerifyResetCodeDto) {
    const hashResetCode = this.cryptoService.createSha256Hash(dto.resetCode);
    const ok = await this.authPasswordResetService.verifyCode(
      dto.email,
      hashResetCode,
    );
    if (!ok) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'auth.invalidResetCode',
      );
    }

    return { message: 'Reset code verified' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<UserDocument> {
    const user = await this.userRepo.findUserByEmail(dto.email);
    if (!user) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'auth.userNotFoundByEmail',
        { email: dto.email },
      );
    }

    const verified = await this.authPasswordResetService.isVerified(dto.email);
    if (!verified) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'auth.resetCodeNotVerified',
      );
    }

    const updatedUser = await this.userRepo.updatePassword(
      user._id,
      await this.hashService.hash(dto.newPassword),
      { bumpSessionVersion: true },
    );

    await this.authPasswordResetService.clear(dto.email);
    await this.authSessionService.revokeAllSessions(updatedUser._id.toString());
    return updatedUser;
  }

  private async findOrCreateGoogleUser(googleUser: {
    googleId: string;
    email: string;
    name: string;
  }): Promise<UserDocument> {
    const byGoogle = await this.userRepo.findByGoogleId(googleUser.googleId);
    if (byGoogle) return byGoogle;

    const byEmail = await this.userRepo.findUserByEmail(googleUser.email);
    if (byEmail) {
      const linked = await this.userRepo.updateUser(byEmail._id, {
        googleId: googleUser.googleId,
      });
      return linked ?? byEmail;
    }

    return this.userRepo.createUser({
      googleId: googleUser.googleId,
      name: googleUser.name,
      email: googleUser.email,
      password: await this.hashService.hash(
        crypto.randomBytes(32).toString('hex'),
      ),
    });
  }

  private assertSessionVersion(
    user: UserDocument,
    tokenSessionVersion?: number,
  ): void {
    const tokenSv = tokenSessionVersion ?? 0;
    const userSv = user.sessionVersion ?? 0;
    if (tokenSv !== userSv) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.passwordChanged',
      );
    }
  }
}
