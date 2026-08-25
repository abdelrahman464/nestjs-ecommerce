import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { UserRole } from '../enums/user-role.enum';
import { UpdateProfileDto } from './update-profile.dto';

/** Admin-only user patch. Same profile fields, plus role. */
export class UpdateUserDto extends UpdateProfileDto {
  @IsOptional()
  @IsEnum(UserRole, {
    message: i18nValidationMessage('validation.invalid_enum'),
  })
  role?: UserRole;
}
