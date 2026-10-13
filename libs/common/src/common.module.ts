import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CommonService } from './common.service';
import { AuditLogService } from './audit/audit-log.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '@poojawala/entities';
import { RequestContextMiddleware } from './context/request-context';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [CommonService, AuditLogService, RequestContextMiddleware],
  exports: [CommonService, AuditLogService, RequestContextMiddleware],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
