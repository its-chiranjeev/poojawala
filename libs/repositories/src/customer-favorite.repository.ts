import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerFavorite } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CustomerFavoriteRepository extends BaseRepository<CustomerFavorite> {
  constructor(
    @InjectRepository(CustomerFavorite)
    repo: Repository<CustomerFavorite>,
  ) {
    super(repo);
  }
}
