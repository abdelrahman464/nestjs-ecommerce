import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
//Keeps validation decorators from CreateUserDto
//PartialType(...) — Makes all remaining fields optional
export class UpdateUserDto extends PartialType(
  //OmitType(CreateUserDto, ['password']) — Excludes the password field (password updates should use the change-password endpoint)
  OmitType(CreateUserDto, ['password'] as const),
) {
  passwordResetVerified?: boolean;
  passwordResetCode?: string;
  passwordResetExpires?: Date;
}
