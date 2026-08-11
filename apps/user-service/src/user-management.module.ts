import { Module } from '@nestjs/common';
import { UserManagementController } from './user-management.controller';
import { UserModule } from './user/user.module';
import { BookingModule } from './booking/booking.module';
import { ComplaintModule } from './complaint/complaint.module';

import { DatabaseModule } from '@poojawala/database';
import { UserManagementService } from './user-management.service';
import { EntitiesModule } from '@poojawala/entities';
import { ConfigModule } from '@nestjs/config';
import { ServiceModule } from './service/service.module';
import { ReviewModule } from './review/review.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CouponModule } from './coupon/coupon.module';

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
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule { }
