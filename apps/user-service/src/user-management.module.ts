import { Module } from '@nestjs/common';
import { UserManagementController } from './user-management.controller';
import { UserModule } from './user/user.module';
import { BookingModule } from './booking/booking.module';
import { ComplaintModule } from './complaint/complaint.module';
import { AssignmentModule } from './assignment/assignment.module';
import { CouponModule } from './coupon/coupon.module';
import { ReviewModule } from './review/review.module';
import { ServiceModule } from './service/service.module';
import { ContactUsModule } from './contact-us/contact-us.module';
import { UserManagementService } from './user-management.service';

import { DatabaseModule } from '@poojawala/database';
import { EntitiesModule } from '@poojawala/entities';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    EntitiesModule,
    UserModule,
    ServiceModule,
    ReviewModule,
    BookingModule,
    ComplaintModule,
    CouponModule,
    AssignmentModule,
    ContactUsModule,
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule { }
