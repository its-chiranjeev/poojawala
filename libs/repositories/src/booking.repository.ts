import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class BookingRepository extends BaseRepository<Booking> {
  constructor(
    @InjectRepository(Booking)
    repo: Repository<Booking>,
  ) {
    super(repo);
  }
}
