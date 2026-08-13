import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { AuditLogRepository } from './repository/audit-log.repository';
import { AuditLogDocument } from './schemas/audit-log.schema';
import { RecordAuditInput } from './types/record-audit-input.type';

@Injectable()
export class AuditLogService {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    @InjectPinoLogger(AuditLogService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Persist an audit row after a sensitive mutation succeeded.
   * Never throws — a failed write must not break the business action.
   */
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.auditLogRepository.create(input);
    } catch (error) {
      this.logger.error(
        {
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId?.toString?.() ?? input.resourceId,
          actorId: input.actorId?.toString?.() ?? input.actorId,
          err: error instanceof Error ? error.message : String(error),
        },
        'Failed to record audit log',
      );
    }
  }

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<AuditLogDocument>> {
    return this.auditLogRepository.findAll(queryParams);
  }

  async findOne(id: Types.ObjectId | string): Promise<AuditLogDocument> {
    const doc = await this.auditLogRepository.findById(id);
    if (!doc) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'audit.notFound', {
        id: String(id),
      });
    }
    return doc;
  }
}
