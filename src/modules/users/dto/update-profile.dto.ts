import { IsEmail, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** Fields a user may change on their own account. Role is never accepted here. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: i18nValidationMessage('validation.email_incorrect'),
    },
  )
  email?: string;
}
