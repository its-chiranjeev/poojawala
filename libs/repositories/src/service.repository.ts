import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class ServiceRepository extends BaseRepository<Service> {
  constructor(
    @InjectRepository(Service)
    repo: Repository<Service>,
  ) {
    super(repo);
  }
}
