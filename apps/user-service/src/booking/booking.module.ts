import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, CustomerAddress, Service } from '@likemyproduct/entities';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingRepository } from '@likemyproduct/repositories';
import { S3Module } from '@likemyproduct/s3';
import { SmsServicesModule } from '@likemyproduct/sms-services';
import { EmailServicesModule } from '@likemyproduct/email-services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Service,
      CustomerAddress,
    ]),
    S3Module,
    SmsServicesModule,
    EmailServicesModule,
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingRepository],
  exports: [
    BookingService,
    BookingRepository,
  ],
})
export class BookingModule {}