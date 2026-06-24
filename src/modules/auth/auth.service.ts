import { Injectable, HttpStatus } from '@nestjs/common';
import { I18nHttpException } from 'src/common/filters/i18n-http.exception';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { AuthRepository } from './repository/auth.repository';
import { UserRepository } from '../users/repository/users.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NotificationService } from '../notifications/notification.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Types } from 'mongoose';
import { TokenService } from 'src/common/tokens/token.service';
import { CookieService } from 'src/common/cookies/cookie.service';
import { HashService } from 'src/common/security/hash.service';
import { CryptoService } from 'src/common/security/crypto.service';

@Injectable()
export class AuthService {
  constructor(
    private authRepo: AuthRepository,
    private userRepo: UserRepository,
    private notificationService: NotificationService,
    private tokenService: TokenService,
    private cookieService: CookieService,
    private hashService: HashService,
    private cryptoService: CryptoService,
  ) {}

  /** Create tokens, save refresh hash, set httpOnly cookies. */
  private async signIn(user: UserDocument, res: Response): Promise<UserDocument> {
    const payload = this.tokenService.createPayload(user);
    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);

    await this.userRepo.setRefreshToken(
      user._id,
      await this.hashService.hash(refreshToken),
    );
    this.cookieService.setAuthCookies(res, accessToken, refreshToken);

    return user;
  }

  async register(dto: RegisterDto, res: Response): Promise<UserDocument> {
    const exists = await this.userRepo.findUserByEmail(dto.email);
    if (exists) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'auth.emailInUse');
    }

    const user = await this.userRepo.createUser({
      name: dto.name,
      email: dto.email,
      password: await this.hashService.hash(dto.password),
    });

    return this.signIn(user, res);
  }

  async login(dto: LoginDto, res: Response): Promise<UserDocument> {
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

    return this.signIn(user, res);
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

    this.assertPasswordNotChangedAfter(user, decoded.iat);

    const matches = await this.authRepo.isRefreshTokenMatching(
      user._id.toString(),
      refreshToken,
    );
    if (!matches) {
      throw new I18nHttpException(
        HttpStatus.FORBIDDEN,
        'auth.refreshTokenNotMatched',
      );
    }

    return this.signIn(user, res);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      try {
        const decoded = this.tokenService.verifyRefreshToken(refreshToken);
        await this.userRepo.removeRefreshToken(decoded.id);
      } catch {
        // Always clear cookies below.
      }
    }

    this.cookieService.clearAuthCookies(res);
  }

  async changePassword(
    userId: Types.ObjectId | string,
    dto: ChangePasswordDto,
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

    const updatedUser = await this.userRepo.updatePassword(
      userId,
      await this.hashService.hash(dto.newPassword),
    );

    return this.signIn(updatedUser, res);
  }

  async googleLogin(
    googleUser: {
      googleId: string;
      email: string;
      name: string;
      picture?: string;
    },
    res: Response,
  ): Promise<UserDocument> {
    const user = await this.findOrCreateGoogleUser(googleUser);
    return this.signIn(user, res);
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

    await this.userRepo.updateUser(user._id, {
      passwordResetCode: this.cryptoService.createSha256Hash(resetCode),
      passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000),
      passwordResetVerified: false,
    });

    await this.notificationService.sendEmail(
      dto.email,
      'Password Reset Code',
      `Hi ${user.name},\n\nYour password reset code is: ${resetCode}\n\nThis code is valid for 10 minutes.`,
    );

    return { message: 'Reset code sent to email' };
  }

  async verifyResetCode(dto: VerifyResetCodeDto) {
    const hashResetCode = this.cryptoService.createSha256Hash(dto.resetCode);
    const user = await this.authRepo.findUserByResetCode(hashResetCode);

    if (!user || user.email !== dto.email) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'auth.invalidResetCode',
      );
    }

    await this.userRepo.updateUser(user._id, { passwordResetVerified: true });
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

    if (!user.passwordResetVerified) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'auth.resetCodeNotVerified',
      );
    }

    const updatedUser = await this.authRepo.resetUserPassword(
      dto.email,
      await this.hashService.hash(dto.newPassword),
    );

    if (!updatedUser) {
      throw new I18nHttpException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'auth.passwordUpdateFailed',
      );
    }

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

  private assertPasswordNotChangedAfter(
    user: UserDocument,
    tokenIssuedAt: number,
  ): void {
    if (!user.passwordChangedAt) return;

    const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (changedAt > tokenIssuedAt) {
      throw new I18nHttpException(
        HttpStatus.UNAUTHORIZED,
        'auth.passwordChanged',
      );
    }
  }
}
