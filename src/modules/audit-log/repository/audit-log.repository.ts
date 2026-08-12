import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';
import { RecordAuditInput } from '../types/record-audit-input.type';
import { AuditSource } from '../enums/audit-source.enum';

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async create(input: RecordAuditInput): Promise<AuditLogDocument> {
    const resourceId =
      input.resourceId != null && Types.ObjectId.isValid(String(input.resourceId))
        ? new Types.ObjectId(String(input.resourceId))
        : null;

    const actor =
      input.actorId != null && Types.ObjectId.isValid(String(input.actorId))
        ? new Types.ObjectId(String(input.actorId))
        : null;

    const [doc] = await this.auditLogModel.create([
      {
        actor,
        actorRole: input.actorRole ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId,
        source: input.source ?? AuditSource.HTTP,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: input.metadata,
        success: input.success ?? true,
      },
    ]);
    return doc;
  }

  async findById(id: Types.ObjectId | string): Promise<AuditLogDocument | null> {
    return this.auditLogModel.findById(id).exec();
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<AuditLogDocument>> {
    const features = new ApiFeatures<AuditLogDocument>(
      this.auditLogModel.find(),
      queryParams,
      this.auditLogModel,
    );
    return features.filter().sort().paginate().executePaginated();
  }
}
