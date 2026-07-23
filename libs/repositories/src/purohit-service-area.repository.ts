import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitServiceArea } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PurohitServiceAreaRepository extends BaseRepository<PurohitServiceArea> {
  constructor(
    @InjectRepository(PurohitServiceArea)
    repo: Repository<PurohitServiceArea>,
  ) {
    super(repo);
  }
}
