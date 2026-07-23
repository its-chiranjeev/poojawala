import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PlatformSettingRepository extends BaseRepository<PlatformSetting> {
  constructor(
    @InjectRepository(PlatformSetting)
    repo: Repository<PlatformSetting>,
  ) {
    super(repo);
  }
}
