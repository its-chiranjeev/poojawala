import { Module } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import { EntitiesModule } from '@likemyproduct/entities';
import { UserRepository } from './user.repository';
import { OtpRepository } from './otp.repository';
import { PurohitProfileRepository } from './purohit-profile.repository';
import { PurohitBankAccountRepository } from './purohit-bank-account.repository';
import { PurohitServiceAreaRepository } from './purohit-service-area.repository';
import { PurohitMediaRepository } from './purohit-media.repository';
import { ServiceRepository } from './service.repository';
import { PurohitServiceRepository } from './purohit-service.repository';
import { CustomerAddressRepository } from './customer-address.repository';
import { CustomerFavoriteRepository } from './customer-favorite.repository';
import { BookingRepository } from './booking.repository';
import { PaymentRepository } from './payment.repository';
import { PaymentBookingRepository } from './payment-booking.repository';
import { ReviewRepository } from './review.repository';
import { ComplaintRepository } from './complaint.repository';
import { PlatformSettingRepository } from './platform-setting.repository';
import { CouponRepository } from './coupon.repository';
import { CouponUsageRepository } from './coupon-usage.repository';
import { CmsContentRepository } from './cms-content.repository';

@Module({
  imports: [EntitiesModule],
  providers: [
    RepositoriesService,
    UserRepository,
    OtpRepository,
    PurohitProfileRepository,
    PurohitBankAccountRepository,
    PurohitServiceAreaRepository,
    PurohitMediaRepository,
    ServiceRepository,
    PurohitServiceRepository,
    CustomerAddressRepository,
    CustomerFavoriteRepository,
    BookingRepository,
    PaymentRepository,
    PaymentBookingRepository,
    ReviewRepository,
    ComplaintRepository,
    PlatformSettingRepository,
    CouponRepository,
    CouponUsageRepository,
    CmsContentRepository,
  ],
  exports: [
    RepositoriesService,
    UserRepository,
    OtpRepository,
    PurohitProfileRepository,
    PurohitBankAccountRepository,
    PurohitServiceAreaRepository,
    PurohitMediaRepository,
    ServiceRepository,
    PurohitServiceRepository,
    CustomerAddressRepository,
    CustomerFavoriteRepository,
    BookingRepository,
    PaymentRepository,
    PaymentBookingRepository,
    ReviewRepository,
    ComplaintRepository,
    PlatformSettingRepository,
    CouponRepository,
    CouponUsageRepository,
    CmsContentRepository,
  ],
})
export class RepositoriesModule { }
