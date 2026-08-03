import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, Complaint, Payment, PurohitProfile } from '@likemyproduct/entities';
import { ComplaintRepository } from '@likemyproduct/repositories';
import { S3Module } from '@likemyproduct/s3';
import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Complaint,
      Booking,
      Payment,
      PurohitProfile,
    ]),
    S3Module,
  ],
  controllers: [ ComplaintController ],
  providers: [ ComplaintService, ComplaintRepository],
  exports: [ ComplaintService ],
})
export class ComplaintModule {}