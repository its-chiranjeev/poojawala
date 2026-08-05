import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponRepository } from '@likemyproduct/repositories';
import { CreateCouponDto, } from '@likemyproduct/dtos';

import { DISCOUNT_TYPE,} from '@likemyproduct/entities';

@Injectable()
export class CouponService {
  constructor(
    private readonly couponRepository: CouponRepository,
  ) {}

  async createCoupon(
    dto: CreateCouponDto,
    adminId: number,
  ) {
    // Check duplicate coupon code
    const existingCoupon = await this.couponRepository.findOne({
      where: {
        code: dto.code.toUpperCase(),
      },
    });

    if (existingCoupon) {
      throw new ConflictException('Coupon code already exists');
    }

    // Validate dates
    if (dto.validUntil <= dto.validFrom) {
      throw new BadRequestException(
        'Valid until must be greater than valid from',
      );
    }

    // Validate percentage discount
    if (dto.discountType === DISCOUNT_TYPE.PERCENTAGE) {
      if (dto.discountValue <= 0 || dto.discountValue > 100) {
        throw new BadRequestException(
          'Percentage discount must be between 1 and 100',
        );
      }

      const calculatedDiscount =
        (dto.minBookingAmount * dto.discountValue) / 100;

      // if (
      //   dto.maxDiscountAmount !== undefined &&
      //   calculatedDiscount > dto.maxDiscountAmount
      // ) {
      //   throw new BadRequestException(
      //     'Calculated discount exceeds maximum discount amount',
      //   );
      // } {
      //   throw new BadRequestException(
      //     'Calculated discount exceeds maximum discount amount',
      //   );
      // }
    }

    if (dto.discountType === DISCOUNT_TYPE.FLAT) {
      if (dto.discountValue <= 0) {
        throw new BadRequestException(
          'Flat discount must be greater than 0',
        );
      }

      // if (
      //   dto.maxDiscountAmount !== undefined &&
      //   dto.discountValue > dto.maxDiscountAmount
      // ) {
      //   throw new BadRequestException(
      //     'Flat discount cannot exceed maximum discount amount',
      //   );
      // } {
      //   throw new BadRequestException(
      //     'Flat discount cannot exceed maximum discount amount',
      //   );
      // }
    }
  
    const coupon = this.couponRepository.create({
      ...dto,
      code: dto.code.toUpperCase(),
      createdById: adminId,
    });

    await this.couponRepository.save(coupon);

    return {
      success: true,
      message: 'Coupon created successfully',
      data: coupon,
    };
  }

  async getAllCoupons(
    page: number,
    limit: number,
    search?: string,
    isActive?: boolean,
    discountType?: DISCOUNT_TYPE,
  ) {
    const {coupons, total} = await this.couponRepository.getAllCoupons(
      page,
      limit,
      search,
      isActive,
      discountType,
    );

    return {
      success: true,
      message: 'Coupons fetched successfully',
      data: coupons,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCouponById(id: number) {
    const coupon = await this.couponRepository.getCouponById(id);

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return {
      success: true,
      message: 'Coupon fetched successfully',
      data: coupon,
    };
  }

  async updateCoupon(
    id: number,
    dto: CreateCouponDto,
    adminId: number,
  ) {
    const coupon = await this.couponRepository.findById(id);

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const noChanges =
      coupon.code === dto.code.toUpperCase() &&
      coupon.description === dto.description &&
      coupon.discountType === dto.discountType &&
      Number(coupon.discountValue) === Number(dto.discountValue) &&
      Number(coupon.maxDiscountAmount ?? 0) ===
        Number(dto.maxDiscountAmount ?? 0) &&
      Number(coupon.minBookingAmount) ===
        Number(dto.minBookingAmount) &&
      JSON.stringify(coupon.applicableServiceIds ?? []) ===
        JSON.stringify(dto.applicableServiceIds ?? []) &&
      Number(coupon.usageLimitTotal) ===
        Number(dto.usageLimitTotal) &&
      Number(coupon.usageLimitPerCustomer) ===
        Number(dto.usageLimitPerCustomer) &&
      coupon.isActive === dto.isActive &&
      new Date(coupon.validFrom).toISOString() ===
        new Date(dto.validFrom).toISOString() &&
      new Date(coupon.validUntil).toISOString() ===
        new Date(dto.validUntil).toISOString();

    if (noChanges) {
      throw new BadRequestException(
        'Coupon already contains the same details',
      );
    }

    const existingCoupon = await this.couponRepository.findOne({
      where: {
        code: dto.code.toUpperCase(),
      },
    });

    if (existingCoupon && existingCoupon.id !== id) {
      throw new ConflictException('Coupon code already exists');
    }

    if (dto.validUntil <= dto.validFrom) {
      throw new BadRequestException(
        'Valid until must be greater than valid from',
      );
    }

    if (dto.discountType === DISCOUNT_TYPE.PERCENTAGE) {
      if (dto.discountValue <= 0 || dto.discountValue > 100) {
        throw new BadRequestException(
          'Percentage discount must be between 1 and 100',
        );
      }

      const calculatedDiscount =
        (dto.minBookingAmount * dto.discountValue) / 100;

      if (
        dto.maxDiscountAmount !== undefined &&
        calculatedDiscount > dto.maxDiscountAmount
      ) {
        throw new BadRequestException(
          'Calculated discount exceeds maximum discount amount',
        );
      }
    }

    if (dto.discountType === DISCOUNT_TYPE.FLAT) {
      if (dto.discountValue <= 0) {
        throw new BadRequestException(
          'Flat discount must be greater than 0',
        );
      }

      if (
        dto.maxDiscountAmount !== undefined &&
        dto.discountValue > dto.maxDiscountAmount
      ) {
        throw new BadRequestException(
          'Flat discount cannot exceed maximum discount amount',
        );
      }
    }

    await this.couponRepository.update(id, {
      ...dto,
      code: dto.code.toUpperCase(),
      createdById: adminId,
    });

    return {
      success: true,
      message: 'Coupon updated successfully',
    };
  }


  async deleteCoupon(id: number) {
    const coupon = await this.couponRepository.getCouponByIdWithDeleted(id);

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    if (coupon.deletedAt) {
      throw new BadRequestException('Coupon is already deleted');
    }

    coupon.deletedAt = new Date();
    coupon.isActive = false;

    await this.couponRepository.save(coupon);

    return {
      success: true,
      message: 'Coupon deleted successfully',
    };
  }


  async restoreCoupon(id: number) {
    const coupon = await this.couponRepository.getCouponByIdWithDeleted(id);

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (!coupon.deletedAt) {
      throw new BadRequestException('Coupon is already active');
    }

    await this.couponRepository.restoreCoupon(id);

    return {
      success: true,
      message: 'Coupon restored successfully',
    };
  }
}