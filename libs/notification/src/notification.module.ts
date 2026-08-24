import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { RepositoriesModule } from '@poojawala/repositories';
import { GatewayModule } from '@poojawala/gateway';

@Module({
  imports: [RepositoriesModule, GatewayModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
