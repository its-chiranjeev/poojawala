import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsContent } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CmsContentRepository extends BaseRepository<CmsContent> {
  constructor(
    @InjectRepository(CmsContent)
    repo: Repository<CmsContent>,
  ) {
    super(repo);
  }
}
