import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitService } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PurohitServiceRepository extends BaseRepository<PurohitService> {
  constructor(
    @InjectRepository(PurohitService)
    repo: Repository<PurohitService>,
  ) {
    super(repo);
  }
}
