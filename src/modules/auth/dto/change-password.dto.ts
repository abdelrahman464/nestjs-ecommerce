import { IsBoolean, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ChangePasswordDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.current_password_required'),
  })
  currentPassword: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.password_required'),
  })
  @MinLength(6, {
    message: i18nValidationMessage('validation.password_min_length', {
      min: '$constraint1',
    }),
  })
  newPassword: string;

  /**
   * If true, logout every other device.
   * Default false: only this device gets a new session.
   */
  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;
}
