import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';
import { Otp } from './otp.entity';
import { PurohitProfile } from './purohit-profile.entity';
import { PurohitBankAccount } from './purohit-bank-account.entity';
import { PurohitServiceArea } from './purohit-service-area.entity';
import { PurohitMedia } from './purohit-media.entity';
import { Service } from './service.entity';
import { PurohitService } from './purohit-service.entity';
import { CustomerAddress } from './customer-address.entity';
import { CustomerFavorite } from './customer-favorite.entity';
import { Booking } from './booking.entity';
import { Payment } from './payment.entity';
import { PaymentBooking } from './payment-booking.entity';
import { Review } from './review.entity';
import { Complaint } from './complaint.entity';
import { PlatformSetting } from './platform-setting.entity';
import { Coupon } from './coupon.entity';
import { CouponUsage } from './coupon-usage.entity';
import { CmsContent } from './cms-content.entity';
import { EntitiesService } from './entities.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Otp,
      PurohitProfile,
      PurohitBankAccount,
      PurohitServiceArea,
      PurohitMedia,
      Service,
      PurohitService,
      CustomerAddress,
      CustomerFavorite,
      Booking,
      Payment,
      PaymentBooking,
      Review,
      Complaint,
      PlatformSetting,
      Coupon,
      CouponUsage,
      CmsContent,
    ]),
  ],
  providers: [EntitiesService],
  exports: [
    TypeOrmModule, // VERY IMPORTANT
  ],
})
export class EntitiesModule { }
