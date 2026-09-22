import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingProduct } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class BookingProductRepository extends BaseRepository<BookingProduct> {
  constructor(
    @InjectRepository(BookingProduct)
    repo: Repository<BookingProduct>,
  ) {
    super(repo);
  }

  async findByBookingId(bookingId: number): Promise<BookingProduct[]> {
    return this.repo.find({
      where: { bookingId },
      relations: ['product'],
      order: { createdAt: 'ASC' },
    });
  }

  async findByCustomerId(customerId: number): Promise<BookingProduct[]> {
    return this.repo.find({
      where: { customerId },
      relations: ['product', 'booking'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByPaymentId(paymentId: number): Promise<BookingProduct[]> {
    return this.repo.find({
      where: { paymentId },
      relations: ['product'],
      order: { createdAt: 'ASC' },
    });
  }
}
