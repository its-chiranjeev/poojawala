import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem, Payment, User } from '@poojawala/entities';
import { RepositoriesModule } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { CommonModule } from '@poojawala/common';
import { NotificationModule } from '@poojawala/notification';
import { EmailServicesModule } from '@poojawala/email-services';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Payment, User]),
    RepositoriesModule,
    S3Module,
    CommonModule,
    NotificationModule,
    EmailServicesModule,
    CartModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
