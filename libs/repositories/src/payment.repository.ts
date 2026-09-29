import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
import {
  Payment,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  USER_ROLE,
  PAYMENT_METHOD,
  CUSTOMER_PAYMENT_METHOD,
  BOOKING_PAYMENT_STATUS,
} from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

export interface FindMyPaymentsOptions {
  userId: number;
  userRole: USER_ROLE;

  page?: number;
  limit?: number;

  status?: PAYMENT_STATUS | PAYMENT_STATUS[];
  paymentType?: PAYMENT_TYPE | string;
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

  search?: string;
}

export interface FindAllPaymentsOptions {
  page?: number;
  limit?: number;

  status?: PAYMENT_STATUS | PAYMENT_STATUS[];
  paymentType?: PAYMENT_TYPE;
  paymentMethod?: PAYMENT_METHOD;
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

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
        ]),
      },

      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findPaymentsByBookingId(bookingId: number): Promise<Payment[]> {
    return this.repo.find({
      where: [
        // TODO: Old condition requiring razorpayPaymentLinkId only
        // {
        //   bookingId,
        //   paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
        //   razorpayPaymentLinkId: Not(IsNull()),
        // },
        {
          bookingId,
          paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
          razorpayPaymentLinkId: Not(IsNull()),
        },
        {
          bookingId,
          paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
          customerPaymentMethod: CUSTOMER_PAYMENT_METHOD.CASH,
        },
      ],

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
      purohitPayoutStatus,
      bookingPaymentStatus,
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

      // Exclude purohit payout payment details from customer
      query.andWhere('payment."paymentType" != :payoutType', {
        payoutType: PAYMENT_TYPE.PUROHIT_PAYOUT,
      });

      // Do NOT show payments in CREATED status to customer (e.g. payment link generated but not paid)
      query.andWhere('payment."status" != :createdStatus', {
        createdStatus: PAYMENT_STATUS.CREATED,
      });

      // TODO: Old filter requiring razorpayPaymentLinkId for all booking payments
      // query.andWhere(
      //   '(payment."paymentType" != :bookingPaymentType OR (payment."razorpayPaymentLinkId" IS NOT NULL AND payment."razorpayPaymentLinkId" != \'\'))',
      //   { bookingPaymentType: PAYMENT_TYPE.BOOKING_PAYMENT },
      // );
      query.andWhere(
        '(payment."paymentType" != :bookingPaymentType OR (payment."razorpayPaymentLinkId" IS NOT NULL AND payment."razorpayPaymentLinkId" != \'\') OR payment."customerPaymentMethod" = :cashMethod)',
        {
          bookingPaymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
          cashMethod: CUSTOMER_PAYMENT_METHOD.CASH,
        },
      );
    } else if (userRole === USER_ROLE.PUROHIT) {
      query.andWhere(
        `(
        payment."createdById" = :userId
        OR (payment."paymentType" = 'PUROHIT_PAYOUT' AND payment."payeeId" = :userId)
        OR (payment."paymentType" = 'BOOKING_PAYMENT' AND purohitUser.id = :userId AND "booking"."paymentStatus" = 'PAID' AND "booking"."purohitPayoutStatus" = 'PENDING')
      )`,
        {
          userId,
        },
      );
    } else {
      query.andWhere('1 = 0');
    }

    if (status) {
      if (Array.isArray(status)) {
        query.andWhere('payment.status IN (:...status)', { status });
      } else {
        query.andWhere('payment.status = :status', { status });
      }
    }

    if (paymentType) {
      // TODO: Old direct paymentType filter
      // query.andWhere('payment."paymentType" = :paymentType', {
      //   paymentType,
      // });
      if ((paymentType as string) === 'CASH') {
        query.andWhere(
          '(payment."customerPaymentMethod" = :cashMethod OR (payment."createdById" != booking."customerId" AND payment."createdById" = payment."payeeId"))',
          { cashMethod: CUSTOMER_PAYMENT_METHOD.CASH },
        );
      } else {
        query.andWhere('payment."paymentType" = :paymentType', {
          paymentType,
        });
      }
    }

    if (purohitPayoutStatus) {
      if (Array.isArray(purohitPayoutStatus)) {
        query.andWhere(
          '("booking"."purohitPayoutStatus" IN (:...purohitPayoutStatus1) OR "linkedBooking"."purohitPayoutStatus" IN (:...purohitPayoutStatus2))',
          { purohitPayoutStatus1: purohitPayoutStatus, purohitPayoutStatus2: purohitPayoutStatus },
        );
      } else {
        query.andWhere(
          '("booking"."purohitPayoutStatus" = :purohitPayoutStatus1 OR "linkedBooking"."purohitPayoutStatus" = :purohitPayoutStatus2)',
          { purohitPayoutStatus1: purohitPayoutStatus, purohitPayoutStatus2: purohitPayoutStatus },
        );
      }
    }

    if (bookingPaymentStatus) {
      if (Array.isArray(bookingPaymentStatus)) {
        query.andWhere(
          '("booking"."paymentStatus" IN (:...bookingPaymentStatus1) OR "linkedBooking"."paymentStatus" IN (:...bookingPaymentStatus2))',
          { bookingPaymentStatus1: bookingPaymentStatus, bookingPaymentStatus2: bookingPaymentStatus },
        );
      } else {
        query.andWhere(
          '("booking"."paymentStatus" = :bookingPaymentStatus1 OR "linkedBooking"."paymentStatus" = :bookingPaymentStatus2)',
          { bookingPaymentStatus1: bookingPaymentStatus, bookingPaymentStatus2: bookingPaymentStatus },
        );
      }
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
      where: [
        {
          payerId,
          paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
          razorpayPaymentLinkId: Not(IsNull()),
        },
        {
          payerId,
          paymentType: Not(PAYMENT_TYPE.BOOKING_PAYMENT),
        },
      ],

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
      purohitPayoutStatus,
      bookingPaymentStatus,

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

    query.andWhere(
      '(payment."paymentType" != :bookingPaymentType OR (payment."razorpayPaymentLinkId" IS NOT NULL AND payment."razorpayPaymentLinkId" != \'\'))',
      { bookingPaymentType: PAYMENT_TYPE.BOOKING_PAYMENT },
    );

    if (status) {
      if (Array.isArray(status)) {
        query.andWhere('payment.status IN (:...status)', { status });
      } else {
        query.andWhere('payment.status = :status', { status });
      }
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

    if (purohitPayoutStatus) {
      if (Array.isArray(purohitPayoutStatus)) {
        query.andWhere(
          '(booking.purohitPayoutStatus IN (:...purohitPayoutStatus) OR linkedBooking.purohitPayoutStatus IN (:...purohitPayoutStatus))',
          { purohitPayoutStatus },
        );
      } else {
        query.andWhere(
          '(booking.purohitPayoutStatus = :purohitPayoutStatus OR linkedBooking.purohitPayoutStatus = :purohitPayoutStatus)',
          { purohitPayoutStatus },
        );
      }
    }

    if (bookingPaymentStatus) {
      if (Array.isArray(bookingPaymentStatus)) {
        query.andWhere(
          '(booking.paymentStatus IN (:...bookingPaymentStatus) OR linkedBooking.paymentStatus IN (:...bookingPaymentStatus))',
          { bookingPaymentStatus },
        );
      } else {
        query.andWhere(
          '(booking.paymentStatus = :bookingPaymentStatus OR linkedBooking.paymentStatus = :bookingPaymentStatus)',
          { bookingPaymentStatus },
        );
      }
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
