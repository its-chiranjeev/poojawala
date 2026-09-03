import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { AuditLogService } from './audit/audit-log.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '@poojawala/entities';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [CommonService, AuditLogService],
  exports: [CommonService, AuditLogService],
})
export class CommonModule {}
