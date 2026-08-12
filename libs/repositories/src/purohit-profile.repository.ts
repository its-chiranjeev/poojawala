import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitProfile } from '@poojawala/entities';
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
}
