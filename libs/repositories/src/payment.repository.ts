import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
  constructor(
    @InjectRepository(Payment)
    repo: Repository<Payment>,
  ) {
    super(repo);
  }
}
