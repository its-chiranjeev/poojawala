import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CouponRepository extends BaseRepository<Coupon> {
  constructor(
    @InjectRepository(Coupon)
    repo: Repository<Coupon>,
  ) {
    super(repo);
  }
}
