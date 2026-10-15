import { Module } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import { EntitiesModule } from '@poojawala/entities';
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
import { ComplaintRepository } from './complaint.repository';
import { PlatformSettingRepository } from './platform-setting.repository';
import { CouponRepository } from './coupon.repository';
import { CouponUsageRepository } from './coupon-usage.repository';
import { CmsContentRepository } from './cms-content.repository';
import { NotificationRepository } from './notification.repository';
import { ContactUsRepository } from './contact-us.repository';
import { ProductRepository } from './product.repository';
import { CartRepository } from './cart.repository';
import { CartItemRepository } from './cart-item.repository';
import { BookingProductRepository } from './booking-product.repository';
import { OrderRepository } from './order.repository';
import { TempleRepository } from './temple.repository';
import { ServiceFeatureRepository } from './service-feature.repository';
import { AstrologerProfileRepository } from './astrologer-profile.repository';

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
    ComplaintRepository,
    PlatformSettingRepository,
    CouponRepository,
    CouponUsageRepository,
    CmsContentRepository,
    NotificationRepository,
    ContactUsRepository,
    ProductRepository,
    CartRepository,
    CartItemRepository,
    BookingProductRepository,
    OrderRepository,
    TempleRepository,
    ServiceFeatureRepository,
    AstrologerProfileRepository,
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
    ComplaintRepository,
    PlatformSettingRepository,
    CouponRepository,
    CouponUsageRepository,
    CmsContentRepository,
    NotificationRepository,
    ContactUsRepository,
    ProductRepository,
    CartRepository,
    CartItemRepository,
    BookingProductRepository,
    OrderRepository,
    TempleRepository,
    ServiceFeatureRepository,
    AstrologerProfileRepository,
  ],
})
export class RepositoriesModule { }
