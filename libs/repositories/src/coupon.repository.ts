import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, DISCOUNT_TYPE } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CouponRepository extends BaseRepository<Coupon> {
  constructor(
    @InjectRepository(Coupon)
    repo: Repository<Coupon>,
  ) {
    super(repo);
  }

  async getAllCoupons(
    page: number,
    limit: number,
    search?: string,
    isActive?: boolean,
    discountType?: DISCOUNT_TYPE,
  ) {
    const query = this.repo.createQueryBuilder('coupon');

    if (search) {
      query.andWhere(
        '(LOWER(coupon.code) LIKE LOWER(:search) OR LOWER(coupon.description) LIKE LOWER(:search))',
        {
          search: `%${search}%`,
        },
      );
    }

    if (isActive !== undefined) {
      query.andWhere('coupon.isActive = :isActive', {
        isActive,
      });
    }

    if (discountType) {
      query.andWhere('coupon.discountType = :discountType', {
        discountType,
      });
    }

    query.skip((page - 1) * limit).take(limit);

    const [coupons, total] = await query.getManyAndCount();

    return {
      coupons,
      total,
    };
  }

  async getCouponById(id: number) {
    return this.repo.findOne({
      where: { id },
    });
  }

  async getCouponByIdWithDeleted(id: number) {
    return this.repo
      .createQueryBuilder('coupon')
      .withDeleted()
      .where('coupon.id = :id', { id })
      .getOne();
  }

  async restoreCoupon(id: number) {
    await this.repo.query(
      `UPDATE coupons
       SET "deletedAt" = NULL,
           "isActive" = true
       WHERE id = $1`,
      [id],
    );
  }
}