import { Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditResourceType } from '../enums/audit-resource-type.enum';
import { AuditSource } from '../enums/audit-source.enum';

export type RecordAuditInput = {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: Types.ObjectId | string | null;
  actorId?: Types.ObjectId | string | null;
  actorRole?: UserRole | null;
  actorEmail?: string | null;
  source?: AuditSource;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  success?: boolean;
};
