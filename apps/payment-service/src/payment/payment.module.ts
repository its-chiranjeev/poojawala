import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, Payment, PaymentBooking } from '@poojawala/entities';
import { BookingRepository, PaymentRepository } from '@poojawala/repositories';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { NotificationModule } from '@poojawala/notification';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Payment,
      PaymentBooking,
    ]),
    NotificationModule,
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    BookingRepository,
    PaymentRepository,
  ],

  exports: [PaymentService],
})
export class PaymentModule {}