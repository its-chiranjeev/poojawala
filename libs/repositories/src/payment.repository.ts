import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PAYMENT_STATUS } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
  constructor(
    @InjectRepository(Payment)
    repo: Repository<Payment>,
  ) {
    super(repo);
  }

  async findPaymentById(paymentId: number): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        id: paymentId,
      },
      relations: {
        booking: {
          customer: true,
          service: true,
          purohit: {
            user: true,
          },
        },
        createdBy: true,
        payer: true,
        payee: true,
        paymentBookings: {
          booking: true,
        },
      },
    });
  }

  async findLatestByBookingId(bookingId: number): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        bookingId,
      },
      relations: {
        booking: true,
        payer: true,
        payee: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findByRazorpayOrderId(
    razorpayOrderId: string,
  ): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        razorpayOrderId,
      },
      relations: {
        booking: true,
        payer: true,
        payee: true,
      },
    });
  }

  async findByRazorpayPaymentId(
    razorpayPaymentId: string,
  ): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        razorpayPaymentId,
      },
      relations: {
        booking: true,
        payer: true,
        payee: true,
      },
    });
  }

  async findPendingByBookingId(bookingId: number): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        bookingId,
        status: PAYMENT_STATUS.PENDING,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findPaymentsByPayer(
    payerId: number,
    page: number,
    limit: number,
  ): Promise<{
    payments: Payment[];
    total: number;
  }> {
    const [payments, total] = await this.repo.findAndCount({
      where: {
        payerId,
      },
      relations: {
        booking: true,
        payee: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      payments,
      total,
    };
  }
}
