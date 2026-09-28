import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Booking,
  CustomerAddress,
  Service,
  Payment,
  PaymentBooking,
} from '@poojawala/entities';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingRepository, PaymentRepository, RepositoriesModule } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { SmsServicesModule } from '@poojawala/sms-services';
import { EmailServicesModule } from '@poojawala/email-services';
import { AssignmentModule } from '../assignment/assignment.module';
import { GatewayModule } from '@poojawala/gateway';
import { NotificationModule } from '@poojawala/notification';
import { CommonModule } from '@poojawala/common';
import { PaymentService } from '../../../payment-service/src/payment/payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Service,
      CustomerAddress,
      Payment,
      PaymentBooking,
    ]),
    AssignmentModule,
    S3Module,
    SmsServicesModule,
    GatewayModule,
    EmailServicesModule,
    NotificationModule,
    CommonModule,
    RepositoriesModule,
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingRepository, PaymentService, PaymentRepository],
  exports: [BookingService, BookingRepository],
})
export class BookingModule {}