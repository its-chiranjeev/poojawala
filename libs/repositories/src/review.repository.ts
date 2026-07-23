import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class ReviewRepository extends BaseRepository<Review> {
  constructor(
    @InjectRepository(Review)
    repo: Repository<Review>,
  ) {
    super(repo);
  }
}
