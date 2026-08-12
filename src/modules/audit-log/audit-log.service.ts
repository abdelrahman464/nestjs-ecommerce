import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { AuditLogRepository } from './repository/audit-log.repository';
import { AuditLogDocument } from './schemas/audit-log.schema';
import { RecordAuditInput } from './types/record-audit-input.type';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Persist an audit row. Never throws — a failed write must not break the
   * business mutation that already succeeded.
   */
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.auditLogRepository.create(input);
    } catch (error) {
      this.logger.error(
        `Failed to record audit action=${input.action}`,
        error instanceof Error ? error.stack : String(error),
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
