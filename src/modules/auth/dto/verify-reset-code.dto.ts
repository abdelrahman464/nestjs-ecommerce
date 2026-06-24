import { IsEmail, IsString, Length, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class VerifyResetCodeDto {
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
    message: i18nValidationMessage('validation.reset_code_required'),
  })
  @IsString({
    message: i18nValidationMessage('validation.must_be_string'),
  })
  @Length(6, 6, {
    message: i18nValidationMessage('validation.reset_code_length', {
      min: '$constraint1',
    }),
  })
  resetCode: string;
}
