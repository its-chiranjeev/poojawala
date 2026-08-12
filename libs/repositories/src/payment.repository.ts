import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import {
  Payment,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  USER_ROLE,
  PAYMENT_METHOD,
} from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

export interface FindMyPaymentsOptions {
  userId: number;
  userRole: USER_ROLE;

  page?: number;
  limit?: number;

  status?: PAYMENT_STATUS;
  paymentType?: PAYMENT_TYPE;

  search?: string;
}

export interface FindAllPaymentsOptions {
  page?: number;
  limit?: number;

  status?: PAYMENT_STATUS;
  paymentType?: PAYMENT_TYPE;
  paymentMethod?: PAYMENT_METHOD;

  bookingId?: number;
  customerId?: number;
  purohitId?: number;

  search?: string;

  fromDate?: string;
  toDate?: string;
}

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
        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
      },

      relations: {
        booking: {
          customer: true,
          service: true,
          purohit: {
            user: true,
          },
        },

        payer: true,
        payee: true,

        paymentBookings: {
          booking: true,
        },
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

  async findPendingByBookingId(
    bookingId: number,
    payerId?: number,
  ): Promise<Payment | null> {
    const where: FindOptionsWhere<Payment> = {
      bookingId,

      paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,

      status: PAYMENT_STATUS.PENDING,
    };

    if (payerId) {
      where.payerId = payerId;
    }

    return this.repo.findOne({
      where,

      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findActivePaymentByBookingId(
    bookingId: number,
  ): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        bookingId,

        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,

        status: In([
          PAYMENT_STATUS.CREATED,
          PAYMENT_STATUS.PENDING,
          PAYMENT_STATUS.SUCCESS,
        ]),
      },

      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findPaymentsByBookingId(bookingId: number): Promise<Payment[]> {
    return this.repo.find({
      where: {
        bookingId,

        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
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

      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findMyPayments(options: FindMyPaymentsOptions): Promise<{
    payments: Payment[];
    total: number;
  }> {
    const {
      userId,
      userRole,
      page = 1,
      limit = 10,
      status,
      paymentType,
      search,
    } = options;

    const safePage = Math.max(Number(page), 1);

    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);

    const skip = (safePage - 1) * safeLimit;

    const query = this.repo
      .createQueryBuilder('payment')

      .leftJoinAndSelect('payment.booking', 'booking')

      .leftJoinAndSelect('booking.customer', 'customer')

      .leftJoinAndSelect('booking.service', 'service')

      .leftJoinAndSelect('booking.purohit', 'purohit')

      .leftJoinAndSelect('purohit.user', 'purohitUser')

      .leftJoinAndSelect('payment.createdBy', 'createdBy')

      .leftJoinAndSelect('payment.payer', 'payer')

      .leftJoinAndSelect('payment.payee', 'payee')

      .leftJoinAndSelect('payment.paymentBookings', 'paymentBookings')

      .leftJoinAndSelect('paymentBookings.booking', 'linkedBooking')

      .leftJoinAndSelect('linkedBooking.service', 'linkedService');

    if (userRole === USER_ROLE.CUSTOMER) {
      query.andWhere(
        `(
        payment."payerId" = :userId
        OR payment."createdById" = :userId
        OR booking."customerId" = :userId
      )`,
        {
          userId,
        },
      );
    } else if (userRole === USER_ROLE.PUROHIT) {
      query.andWhere(
        `(
        payment."payeeId" = :userId
        OR payment."createdById" = :userId
        OR purohitUser.id = :userId
      )`,
        {
          userId,
        },
      );
    } else {
      query.andWhere('1 = 0');
    }

    if (status) {
      query.andWhere('payment.status = :status', {
        status,
      });
    }

    if (paymentType) {
      query.andWhere('payment."paymentType" = :paymentType', {
        paymentType,
      });
    }

    const normalizedSearch = search?.trim();

    if (normalizedSearch) {
      query.andWhere(
        `(
        booking."bookingNumber" ILIKE :search
        OR service.name ILIKE :search
        OR payment."razorpayPaymentId" ILIKE :search
        OR payment."razorpayOrderId" ILIKE :search
        OR linkedBooking."bookingNumber" ILIKE :search
        OR linkedService.name ILIKE :search
      )`,
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    const [payments, total] = await query
      .distinct(true)

      .orderBy('payment.createdAt', 'DESC')

      .skip(skip)
      .take(safeLimit)

      .getManyAndCount();

    return {
      payments,
      total,
    };
  }

  async findPaymentsByPayer(
    payerId: number,
    page: number,
    limit: number,
  ): Promise<{
    payments: Payment[];
    total: number;
  }> {
    const safePage = Math.max(Number(page), 1);

    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);

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

      skip: (safePage - 1) * safeLimit,

      take: safeLimit,
    });

    return {
      payments,
      total,
    };
  }

  async savePayment(payment: Payment): Promise<Payment> {
    return this.repo.save(payment);
  }

  async findAllPayments(options: FindAllPaymentsOptions): Promise<{
    payments: Payment[];
    total: number;
  }> {
    const {
      page = 1,
      limit = 10,

      status,
      paymentType,
      paymentMethod,

      bookingId,
      customerId,
      purohitId,

      search,

      fromDate,
      toDate,
    } = options;

    const safePage = Math.max(Number(page), 1);

    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);

    const skip = (safePage - 1) * safeLimit;

    const query = this.repo
      .createQueryBuilder('payment')

      .leftJoinAndSelect('payment.booking', 'booking')

      .leftJoinAndSelect('booking.customer', 'customer')

      .leftJoinAndSelect('booking.service', 'service')

      .leftJoinAndSelect('booking.purohit', 'purohit')

      .leftJoinAndSelect('purohit.user', 'purohitUser')

      .leftJoinAndSelect('payment.createdBy', 'createdBy')

      .leftJoinAndSelect('payment.payer', 'payer')

      .leftJoinAndSelect('payment.payee', 'payee')

      .leftJoinAndSelect('payment.paymentBookings', 'paymentBookings')

      .leftJoinAndSelect('paymentBookings.booking', 'linkedBooking')

      .leftJoinAndSelect('linkedBooking.service', 'linkedService');

    if (status) {
      query.andWhere('payment.status = :status', {
        status,
      });
    }

    if (paymentType) {
      query.andWhere('payment."paymentType" = :paymentType', {
        paymentType,
      });
    }

    if (paymentMethod) {
      query.andWhere('payment."paymentMethod" = :paymentMethod', {
        paymentMethod,
      });
    }

    if (bookingId) {
      query.andWhere(
        `(
        payment."bookingId" = :bookingId
        OR linkedBooking.id = :bookingId
      )`,
        {
          bookingId,
        },
      );
    }

    if (customerId) {
      query.andWhere(
        `(
        booking."customerId" = :customerId
        OR payment."payerId" = :customerId
      )`,
        {
          customerId,
        },
      );
    }

    if (purohitId) {
      query.andWhere(
        `(
        purohitUser.id = :purohitId
        OR payment."payeeId" = :purohitId
      )`,
        {
          purohitId,
        },
      );
    }

    const normalizedSearch = search?.trim();

    if (normalizedSearch) {
      query.andWhere(
        `(
        booking."bookingNumber" ILIKE :search
        OR linkedBooking."bookingNumber" ILIKE :search
        OR service.name ILIKE :search
        OR linkedService.name ILIKE :search

        OR customer."firstName" ILIKE :search
        OR customer."lastName" ILIKE :search
        OR customer.email ILIKE :search
        OR customer.phone ILIKE :search

        OR purohitUser."firstName" ILIKE :search
        OR purohitUser."lastName" ILIKE :search
        OR purohitUser.email ILIKE :search
        OR purohitUser.phone ILIKE :search

        OR payment."razorpayPaymentId" ILIKE :search
        OR payment."razorpayOrderId" ILIKE :search
        OR payment."razorpayRefundId" ILIKE :search
        OR payment."bankTransferReference" ILIKE :search
      )`,
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    if (fromDate) {
      const startDate = new Date(fromDate);

      if (!Number.isNaN(startDate.getTime())) {
        query.andWhere('payment."createdAt" >= :fromDate', {
          fromDate: startDate,
        });
      }
    }

    if (toDate) {
      const endDate = new Date(toDate);

      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);

        query.andWhere('payment."createdAt" <= :toDate', {
          toDate: endDate,
        });
      }
    }

    const [payments, total] = await query
      .distinct(true)

      .orderBy('payment.createdAt', 'DESC')

      .skip(skip)
      .take(safeLimit)

      .getManyAndCount();

    return {
      payments,
      total,
    };
  }

  async findByRazorpayRefundId(
    razorpayRefundId: string,
  ): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        razorpayRefundId,
      },

      relations: {
        booking: true,
        payer: true,
        payee: true,
      },
    });
  }

  async findBookingPaymentByRazorpayPaymentId(
    razorpayPaymentId: string,
  ): Promise<Payment | null> {
    return this.repo.findOne({
      where: {
        razorpayPaymentId,

        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
      },

      relations: {
        booking: true,

        paymentBookings: {
          booking: true,
        },
      },
    });
  }

  async getReservedRefundAmountByRazorpayPaymentId(
    razorpayPaymentId: string,
  ): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('refund')
      .select('COALESCE(SUM(refund.amount), 0)', 'total')
      .where('refund.paymentType = :paymentType', {
        paymentType: PAYMENT_TYPE.CUSTOMER_REFUND,
      })
      .andWhere('refund.razorpayPaymentId = :razorpayPaymentId', {
        razorpayPaymentId,
      })
      .andWhere('refund.status IN (:...statuses)', {
        statuses: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.SUCCESS],
      })
      .getRawOne<{
        total: string;
      }>();

    return Number(result?.total ?? 0);
  }
}
