import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from '@poojawala/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';
import { AUDIT_MODULE } from '@poojawala/entities';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLE.ADMIN)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('actorId') actorId?: string,
    @Query('module') module?: AUDIT_MODULE,
    @Query('action') action?: string,
    @Query('entityId') entityId?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    const actorIdNumber = actorId ? parseInt(actorId, 10) : undefined;

    const result = await this.auditLogService.findAuditLogs({
      page: pageNumber,
      limit: limitNumber,
      actorId: actorIdNumber,
      module,
      action,
      entityId,
    });

    return {
      message: 'Audit logs retrieved successfully',
      ...result,
    };
  }
}
