import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitMedia } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PurohitMediaRepository extends BaseRepository<PurohitMedia> {
  constructor(
    @InjectRepository(PurohitMedia)
    repo: Repository<PurohitMedia>,
  ) {
    super(repo);
  }
}
