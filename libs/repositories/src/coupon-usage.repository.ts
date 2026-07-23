import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CouponUsage } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CouponUsageRepository extends BaseRepository<CouponUsage> {
  constructor(
    @InjectRepository(CouponUsage)
    repo: Repository<CouponUsage>,
  ) {
    super(repo);
  }
}
