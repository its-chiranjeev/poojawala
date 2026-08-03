import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitProfile } from '@likemyproduct/entities';
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
    return this.repo.findOne({
      where: {
        userId,
      },
    });
  }
  }
