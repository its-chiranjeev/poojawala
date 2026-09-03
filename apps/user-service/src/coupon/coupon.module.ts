import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from '@poojawala/entities';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import { CouponRepository } from '@poojawala/repositories';
import { CommonModule } from '@poojawala/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coupon]),
    CommonModule,
  ],
  controllers: [CouponController],
  providers: [CouponService, CouponRepository],
})
export class CouponModule {}

