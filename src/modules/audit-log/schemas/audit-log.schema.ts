import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditResourceType } from '../enums/audit-resource-type.enum';
import { AuditSource } from '../enums/audit-source.enum';

/**
 * Append-only security / ops trail for sensitive mutations.
 * Do not update or delete documents in application code.
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  actor?: Types.ObjectId | null;

  @Prop({ type: String, enum: UserRole, default: null })
  actorRole?: UserRole | null;

  @Prop({ trim: true, default: null })
  actorEmail?: string | null;

  @Prop({ type: String, enum: AuditAction, required: true })
  action: AuditAction;

  @Prop({ type: String, enum: AuditResourceType, required: true })
  resourceType: AuditResourceType;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  resourceId?: Types.ObjectId | null;

  @Prop({ type: String, enum: AuditSource, default: AuditSource.HTTP })
  source: AuditSource;

  @Prop({ trim: true })
  ip?: string;

  @Prop({ trim: true })
  userAgent?: string;

  /** Small context only — never passwords, tokens, or full PII dumps. */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  metadata?: Record<string, unknown>;

  @Prop({ default: true })
  success: boolean;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });
