import { IsEmail, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ForgotPasswordDto {
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
}
