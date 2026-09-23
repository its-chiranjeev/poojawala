import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem, Payment } from '@poojawala/entities';
import { RepositoriesModule } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Payment]),
    RepositoriesModule,
    S3Module,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
