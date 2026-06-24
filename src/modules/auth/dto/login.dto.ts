import { IsEmail, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class LoginDto {
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
  password: string;
}
