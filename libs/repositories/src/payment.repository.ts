import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
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
  partnerPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
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
  partnerPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
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
        order: {
          customer: true,
        },
      },
    });
  }

  // TODO: Replaced by comprehensive findLatestByBookingId that searches both
  // direct payment.bookingId and junction paymentBookings.bookingId, and prioritizes
  // confirmed SUCCESS payments over later failed/pending attempts.
  // async findLatestByBookingId(bookingId: number): Promise<Payment | null> {
  //   return this.repo.findOne({
  //     where: {
  //       bookingId,
  //       paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
  //     },
  //     relations: {
  //       booking: {
  //         customer: true,
  //         service: true,
  //         purohit: {
  //           user: true,
  //         },
  //       },
  //       payer: true,
  //       payee: true,
  //       paymentBookings: {
  //         booking: true,
  //       },
  //     },
  //     order: {
  //       createdAt: 'DESC',
  //     },
  //   });
  // }
  async findLatestByBookingId(bookingId: number): Promise<Payment | null> {
    return this.repo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .leftJoinAndSelect('payment.payer', 'payer')
      .leftJoinAndSelect('payment.payee', 'payee')
      .leftJoinAndSelect('payment.paymentBookings', 'paymentBookings')
      .leftJoinAndSelect('paymentBookings.booking', 'linkedBooking')
      .where(
        '(payment.bookingId = :bookingId OR paymentBookings.bookingId = :bookingId)',
        { bookingId },
      )
      .andWhere('payment.paymentType = :paymentType', {
        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
      })
      .orderBy(
        `CASE 
          WHEN payment.status = 'SUCCESS' THEN 1 
          WHEN payment.status = 'PENDING' THEN 2 
          ELSE 3 
        END`,
        'ASC',
      )
      .addOrderBy('payment.createdAt', 'DESC')
      .getOne();
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
      partnerPayoutStatus = options.partnerPayoutStatus ?? options.purohitPayoutStatus,
      bookingPaymentStatus,
      search,
    } = options;

    const safePage = Math.max(Number(page), 1);

    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);

    const skip = (safePage - 1) * safeLimit;

    // TODO: Replaced monolithic 13-join getManyAndCount query with targeted filter + ID pagination + primary key hydration
    // const query = this.repo
    //   .createQueryBuilder('payment')
    //   .leftJoinAndSelect('payment.booking', 'booking')
    //   .leftJoinAndSelect('booking.customer', 'customer')
    //   .leftJoinAndSelect('booking.service', 'service')
    //   .leftJoinAndSelect('booking.purohit', 'purohit')
    //   .leftJoinAndSelect('purohit.user', 'purohitUser')
    //   .leftJoinAndSelect('payment.createdBy', 'createdBy')
    //   .leftJoinAndSelect('payment.payer', 'payer')
    //   .leftJoinAndSelect('payment.payee', 'payee')
    //   .leftJoinAndSelect('payment.paymentBookings', 'paymentBookings')
    //   .leftJoinAndSelect('paymentBookings.booking', 'linkedBooking')
    //   .leftJoinAndSelect('linkedBooking.service', 'linkedService')
    //   .leftJoinAndSelect('payment.order', 'order')
    //   .leftJoinAndSelect('order.customer', 'orderCustomer');
    // ...
    // const [payments, total] = await query.distinct(true).orderBy('payment.createdAt', 'DESC').skip(skip).take(safeLimit).getManyAndCount();
    // return { payments, total };

    // 1. Build targeted filter query containing only the joins necessary for filtering and searching
    const filterQuery = this.repo.createQueryBuilder('payment');

    if (userRole === USER_ROLE.CUSTOMER) {
      filterQuery
        .leftJoin('payment.booking', 'booking')
        .leftJoin('payment.order', 'order');
    }

    if (partnerPayoutStatus || bookingPaymentStatus) {
      if (userRole !== USER_ROLE.CUSTOMER) {
        filterQuery.leftJoin('payment.booking', 'booking');
      }
      filterQuery
        .leftJoin('payment.paymentBookings', 'paymentBookings')
        .leftJoin('paymentBookings.booking', 'linkedBooking');
    }

    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      if (userRole !== USER_ROLE.CUSTOMER && !partnerPayoutStatus && !bookingPaymentStatus) {
        filterQuery.leftJoin('payment.booking', 'booking');
      }
      if (!partnerPayoutStatus && !bookingPaymentStatus) {
        filterQuery
          .leftJoin('payment.paymentBookings', 'paymentBookings')
          .leftJoin('paymentBookings.booking', 'linkedBooking');
      }
      filterQuery
        .leftJoin('booking.service', 'service')
        .leftJoin('linkedBooking.service', 'linkedService');
      if (userRole !== USER_ROLE.CUSTOMER) {
        filterQuery.leftJoin('payment.order', 'order');
      }
    }

    if (userRole === USER_ROLE.CUSTOMER) {
      filterQuery.andWhere(
        `(
        payment."payerId" = :userId
        OR payment."createdById" = :userId
        OR booking."customerId" = :userId
        OR "order"."customerId" = :userId
      )`,
        {
          userId,
        },
      );

      // Exclude partner payout payment details from customer (both purohit and astrologer payouts)
      filterQuery.andWhere('payment."paymentType" NOT IN (:...payoutTypes)', {
        payoutTypes: [
          PAYMENT_TYPE.PUROHIT_PAYOUT,
          PAYMENT_TYPE.ASTROLOGER_PAYOUT,
        ],
      });

      // Do NOT show payments in CREATED status to customer (e.g. payment link generated but not paid)
      filterQuery.andWhere('payment."status" != :createdStatus', {
        createdStatus: PAYMENT_STATUS.CREATED,
      });

      filterQuery.andWhere(
        '(payment."paymentType" != :bookingPaymentType OR (payment."razorpayPaymentLinkId" IS NOT NULL AND payment."razorpayPaymentLinkId" != \'\') OR payment."customerPaymentMethod" = :cashMethod)',
        {
          bookingPaymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
          cashMethod: CUSTOMER_PAYMENT_METHOD.CASH,
        },
      );
    } else if (userRole === USER_ROLE.PUROHIT) {
      filterQuery.andWhere(
        'payment."paymentType" = :payoutType AND payment."payeeId" = :userId',
        {
          payoutType: PAYMENT_TYPE.PUROHIT_PAYOUT,
          userId,
        },
      );
    } else {
      filterQuery.andWhere('1 = 0');
    }

    if (status) {
      if (userRole === USER_ROLE.PUROHIT) {
        const statuses = (Array.isArray(status) ? status : [status]).map((s) =>
          String(s).toUpperCase(),
        );
        const mappedStatuses: string[] = [];
        for (const s of statuses) {
          if (s === 'PAID' || s === 'SUCCESS') {
            mappedStatuses.push(PAYMENT_STATUS.SUCCESS);
          } else if (s === 'PENDING') {
            mappedStatuses.push(PAYMENT_STATUS.PENDING);
          } else {
            mappedStatuses.push(s);
          }
        }
        filterQuery.andWhere('payment.status IN (:...payoutStatuses)', {
          payoutStatuses: mappedStatuses,
        });
      } else {
        if (Array.isArray(status)) {
          filterQuery.andWhere('payment.status IN (:...status)', { status });
        } else {
          filterQuery.andWhere('payment.status = :status', { status });
        }
      }
    }

    if (paymentType) {
      if ((paymentType as string) === 'CASH') {
        filterQuery.andWhere(
          '(payment."customerPaymentMethod" = :cashMethod OR (payment."createdById" != booking."customerId" AND payment."createdById" = payment."payeeId"))',
          { cashMethod: CUSTOMER_PAYMENT_METHOD.CASH },
        );
      } else {
        filterQuery.andWhere('payment."paymentType" = :paymentType', {
          paymentType,
        });
      }
    }

    if (partnerPayoutStatus) {
      if (Array.isArray(partnerPayoutStatus)) {
        filterQuery.andWhere(
          '("booking"."partnerPayoutStatus" IN (:...partnerPayoutStatus1) OR "linkedBooking"."partnerPayoutStatus" IN (:...partnerPayoutStatus2))',
          { partnerPayoutStatus1: partnerPayoutStatus, partnerPayoutStatus2: partnerPayoutStatus },
        );
      } else {
        filterQuery.andWhere(
          '("booking"."partnerPayoutStatus" = :partnerPayoutStatus1 OR "linkedBooking"."partnerPayoutStatus" = :partnerPayoutStatus2)',
          { partnerPayoutStatus1: partnerPayoutStatus, partnerPayoutStatus2: partnerPayoutStatus },
        );
      }
    }

    if (bookingPaymentStatus) {
      if (Array.isArray(bookingPaymentStatus)) {
        filterQuery.andWhere(
          '("booking"."paymentStatus" IN (:...bookingPaymentStatus1) OR "linkedBooking"."paymentStatus" IN (:...bookingPaymentStatus2))',
          { bookingPaymentStatus1: bookingPaymentStatus, bookingPaymentStatus2: bookingPaymentStatus },
        );
      } else {
        filterQuery.andWhere(
          '("booking"."paymentStatus" = :bookingPaymentStatus1 OR "linkedBooking"."paymentStatus" = :bookingPaymentStatus2)',
          { bookingPaymentStatus1: bookingPaymentStatus, bookingPaymentStatus2: bookingPaymentStatus },
        );
      }
    }

    if (normalizedSearch) {
      filterQuery.andWhere(
        `(
        CAST("payment"."id" AS TEXT) ILIKE :search
        OR "booking"."bookingNumber" ILIKE :search
        OR "service"."name" ILIKE :search
        OR "payment"."razorpayPaymentId" ILIKE :search
        OR "payment"."razorpayOrderId" ILIKE :search
        OR "linkedBooking"."bookingNumber" ILIKE :search
        OR "linkedService"."name" ILIKE :search
        OR "order"."orderNumber" ILIKE :search
      )`,
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    // 2. Fast count using targeted filter query without Cartesian expansion
    const total = await filterQuery.getCount();

    if (total === 0) {
      return {
        payments: [],
        total: 0,
      };
    }

    // 3. Fast ID pagination (payment.createdAt added to select list for PostgreSQL SELECT DISTINCT ORDER BY requirement)
    const idRows = await filterQuery
      .select('payment.id', 'id')
      .addSelect('payment.createdAt', 'createdAt')
      .distinct(true)
      .orderBy('payment.createdAt', 'DESC')
      .skip(skip)
      .take(safeLimit)
      .getRawMany();

    const targetIds = idRows.map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0);

    if (targetIds.length === 0) {
      return {
        payments: [],
        total,
      };
    }

    // 4. Batch hydrate exactly the paginated payment records with all required relations
    const payments = await this.repo
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
      .leftJoinAndSelect('linkedBooking.service', 'linkedService')
      .leftJoinAndSelect('payment.order', 'order')
      .leftJoinAndSelect('order.customer', 'orderCustomer')
      .where('payment.id IN (:...targetIds)', { targetIds })
      .orderBy('payment.createdAt', 'DESC')
      .getMany();

    // Preserve exact sort order of targetIds
    const idOrderMap = new Map<number, number>();
    targetIds.forEach((id, idx) => idOrderMap.set(id, idx));
    payments.sort((a, b) => (idOrderMap.get(a.id) ?? 0) - (idOrderMap.get(b.id) ?? 0));

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
        order: true,
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
      partnerPayoutStatus = options.partnerPayoutStatus ?? options.purohitPayoutStatus,
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

      .leftJoinAndSelect('linkedBooking.service', 'linkedService')

      .leftJoinAndSelect('payment.order', 'order')

      .leftJoinAndSelect('order.customer', 'orderCustomer');

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

    if (partnerPayoutStatus) {
      if (Array.isArray(partnerPayoutStatus)) {
        query.andWhere(
          '(booking.partnerPayoutStatus IN (:...partnerPayoutStatus) OR linkedBooking.partnerPayoutStatus IN (:...partnerPayoutStatus))',
          { partnerPayoutStatus },
        );
      } else {
        query.andWhere(
          '(booking.partnerPayoutStatus = :partnerPayoutStatus OR linkedBooking.partnerPayoutStatus = :partnerPayoutStatus)',
          { partnerPayoutStatus },
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
        "purohitUser"."id" = :purohitId
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
        CAST("payment"."id" AS TEXT) ILIKE :search
        OR "booking"."bookingNumber" ILIKE :search
        OR "linkedBooking"."bookingNumber" ILIKE :search
        OR "service"."name" ILIKE :search
        OR "linkedService"."name" ILIKE :search

        OR "customer"."firstName" ILIKE :search
        OR "customer"."lastName" ILIKE :search
        OR CONCAT("customer"."firstName", ' ', "customer"."lastName") ILIKE :search
        OR "customer"."email" ILIKE :search
        OR "customer"."phone" ILIKE :search

        OR "orderCustomer"."firstName" ILIKE :search
        OR "orderCustomer"."lastName" ILIKE :search
        OR CONCAT("orderCustomer"."firstName", ' ', "orderCustomer"."lastName") ILIKE :search

        OR "purohitUser"."firstName" ILIKE :search
        OR "purohitUser"."lastName" ILIKE :search
        OR CONCAT("purohitUser"."firstName", ' ', "purohitUser"."lastName") ILIKE :search
        OR "purohitUser"."email" ILIKE :search
        OR "purohitUser"."phone" ILIKE :search

        OR "payment"."razorpayPaymentId" ILIKE :search
        OR "payment"."razorpayOrderId" ILIKE :search
        OR "order"."orderNumber" ILIKE :search
        OR "payment"."razorpayRefundId" ILIKE :search
        OR "payment"."bankTransferReference" ILIKE :search
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
    manager?: EntityManager,
  ): Promise<number> {
    const qb = (manager ? manager.getRepository(Payment) : this.repo)
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
      });

    const result = await qb.getRawOne<{
      total: string;
    }>();

    return Number(result?.total ?? 0);
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<Payment | null> {
    const repo = manager ? manager.getRepository(Payment) : this.repo;
    return repo.findOne({
      where: { idempotencyKey },
      relations: ['paymentBookings', 'paymentBookings.booking'],
    });
  }
}
