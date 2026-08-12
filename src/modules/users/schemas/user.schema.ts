import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../enums/user-role.enum';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ unique: true, required: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ type: Date, required: false })
  passwordChangedAt?: Date;

  /**
   * Bumped only when all sessions must die (revokeOtherSessions / password reset).
   * Embedded in JWTs as `sv`; guard rejects mismatched tokens.
   * passwordChangedAt is audit-only and always updated on password change.
   */
  @Prop({ type: Number, default: 0 })
  sessionVersion: number;

  // ======== Google OAuth Fields ========
  @Prop({ unique: true, sparse: true })
  googleId?: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
