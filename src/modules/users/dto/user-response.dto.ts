import { Exclude, Expose, Transform } from 'class-transformer';
import { UserRole } from '../enums/user-role.enum';

@Exclude() // Exclude everything by default
export class UserResponseDto {
  @Expose()
  _id: string; // return id not _id

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  role: UserRole;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
