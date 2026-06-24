import { Exclude, Expose } from 'class-transformer';
import { UserRole } from '../enums/user-role.enum';

@Exclude()
export class AdminUserResponseDto {
  @Expose()
  _id: string;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  role: UserRole;

  @Expose()
  googleId?: string;

  @Expose()
  passwordChangedAt?: Date;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<AdminUserResponseDto>) {
    Object.assign(this, partial);
  }
}
