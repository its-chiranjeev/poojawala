import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Booking,
  BookingProduct,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Payment,
  PaymentBooking,
} from '@poojawala/entities';
import { BookingRepository, PaymentRepository } from '@poojawala/repositories';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { NotificationModule } from '@poojawala/notification';
import { GatewayModule } from '@poojawala/gateway';
import { CommonModule } from '@poojawala/common';
import { EmailServicesModule } from '@poojawala/email-services';
import { AssignmentModule } from '../../../user-service/src/assignment/assignment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Payment,
      PaymentBooking,
      BookingProduct,
      Cart,
      CartItem,
      Order,
      OrderItem,
    ]),
    NotificationModule,
    GatewayModule,
    CommonModule,
    EmailServicesModule,
    AssignmentModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, BookingRepository, PaymentRepository],

  exports: [PaymentService],
})
export class PaymentModule {}
