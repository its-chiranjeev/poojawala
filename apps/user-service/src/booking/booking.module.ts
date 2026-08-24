import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, CustomerAddress, Service } from '@poojawala/entities';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { SmsServicesModule } from '@poojawala/sms-services';
import { EmailServicesModule } from '@poojawala/email-services';
import { AssignmentModule } from '../assignment/assignment.module';
import { GatewayModule } from '@poojawala/gateway';
import { NotificationModule } from '@poojawala/notification';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Service, CustomerAddress]),
    AssignmentModule,
    S3Module,
    SmsServicesModule,
    GatewayModule,
    EmailServicesModule,
    NotificationModule,
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingRepository],
  exports: [BookingService, BookingRepository],
})
export class BookingModule {}