import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentBooking } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PaymentBookingRepository extends BaseRepository<PaymentBooking> {
  constructor(
    @InjectRepository(PaymentBooking)
    repo: Repository<PaymentBooking>,
  ) {
    super(repo);
  }
}
