import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { CommonModule } from '@poojawala/common';

@Module({
  imports: [CommonModule],
  controllers: [AuditLogController],
})
export class AuditLogModule {}
