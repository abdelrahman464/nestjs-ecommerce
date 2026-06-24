import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsEnum,
  IsString,
} from 'class-validator';
import { UserRole } from '../enums/user-role.enum';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateUserDto {
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

  @IsOptional()
  @IsEnum(UserRole, {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  role?: UserRole;

  googleId?: string;
}
