import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ResetPasswordDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.email_required'),
  })
  @IsEmail(
    {},
    {
      message: i18nValidationMessage('validation.email_incorrect'),
    },
  )
  email: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.password_required'),
  })
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @MinLength(6, {
    message: i18nValidationMessage('validation.password_min_length', {
      min: '$constraint1',
    }),
  })
  newPassword: string;
}
