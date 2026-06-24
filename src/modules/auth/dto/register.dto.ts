import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RegisterDto {
  @IsNotEmpty({
    message: i18nValidationMessage('validation.name_required'),
  })
  @IsString()
  name: string;

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
  @IsString()
  @MinLength(6, {
    message: i18nValidationMessage('validation.password_min_length', {
      min: '$constraint1',
    }),
  })
  password: string;
}
