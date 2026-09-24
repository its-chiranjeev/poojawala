import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, Complaint, PurohitProfile } from '@poojawala/entities';
import { ComplaintRepository, BookingRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { CommonModule } from '@poojawala/common';
import { NotificationModule } from '@poojawala/notification';
import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Complaint,
      Booking,
      PurohitProfile,
    ]),
    S3Module,
    CommonModule,
    NotificationModule,
  ],
  controllers: [ ComplaintController ],
  providers: [ ComplaintService, ComplaintRepository, BookingRepository],
  exports: [ ComplaintService ],
})
export class ComplaintModule {}