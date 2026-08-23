import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import { THROTTLE } from '../../config/throttler.config';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';

/** Public login/reset routes use THROTTLE.AUTH (5 / 15 min). See throttler.config.ts. */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(THROTTLE.AUTH)
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, req, res);
  }

  @Public()
  @Throttle(THROTTLE.AUTH)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, req, res);
  }

  @Public()
  @Throttle(THROTTLE.REFRESH)
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refreshTokens(req, res);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }

  /** Logout every device (Redis + bump sessionVersion + clear cookies). */
  @Post('logoutAll')
  logoutAll(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logoutAll(authUser.id, req, res);
  }

  /** Active devices/sessions for the current user (from Redis). */
  @Get('sessions')
  listSessions(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.authService.listSessions(req, authUser.id);
  }

  /** Revoke one device session. Clears cookies if it is the current device. */
  @Delete('sessions/:sid')
  revokeSession(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Param('sid') sid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.revokeSessionById(req, res, authUser.id, sid);
  }

  @Throttle(THROTTLE.AUTH)
  @Patch('changePassword')
  changePassword(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.changePassword(authUser.id, dto, req, res);
  }

  @Public()
  @Throttle(THROTTLE.AUTH)
  @Post('forgotPassword')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle(THROTTLE.AUTH)
  @Post('verifyResetCode')
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto);
  }

  @Public()
  @Throttle(THROTTLE.AUTH)
  @Patch('resetPassword')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const googleUser = req.user as {
      googleId: string;
      email: string;
      name: string;
    };
    return this.authService.googleLogin(googleUser, req, res);
  }
}
