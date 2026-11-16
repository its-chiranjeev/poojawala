import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurohitProfile,
  PUROHIT_VERIFICATION_STATUS,
  USER_ROLE,
  USER_STATUS,
} from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PurohitProfileRepository extends BaseRepository<PurohitProfile> {
  constructor(
    @InjectRepository(PurohitProfile)
    repo: Repository<PurohitProfile>,
  ) {
    super(repo);
  }
  async findByUserId(userId: number) {
    return this.repo
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.purohitServices', 'purohitServices')
      .leftJoinAndSelect('purohitServices.service', 'service')
      .where('profile.userId = :userId', { userId })
      .getOne();
  }

  async countActiveApprovedPurohits(): Promise<number> {
    return this.repo
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .where('user.role = :role', { role: USER_ROLE.PUROHIT })
      .andWhere('user.status = :status', { status: USER_STATUS.ACTIVE })
      .andWhere('profile.verificationStatus = :verificationStatus', {
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
      })
      .getCount();
  }
}
