import { Controller, Get, Param, Query } from '@nestjs/common';
import { Types } from 'mongoose';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLogDocument } from './schemas/audit-log.schema';

@Controller('auditLogs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<AuditLogDocument>> {
    return this.auditLogService.findAll(queryParams);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<AuditLogDocument> {
    return this.auditLogService.findOne(id);
  }
}
