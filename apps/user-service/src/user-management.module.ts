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
import { AuditLogModule } from './audit-log/audit-log.module';
import { ProductModule } from './product/product.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { BlogModule } from './blog/blog.module';
import { TempleModule } from './temple/temple.module';

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
    ProductModule,
    CartModule,
    OrderModule,
    ReviewModule,
    BookingModule,
    ComplaintModule,
    CouponModule,
    AssignmentModule,
    ContactUsModule,
    AuditLogModule,
    BlogModule,
    TempleModule,
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule { }
