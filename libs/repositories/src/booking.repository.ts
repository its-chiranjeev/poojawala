import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Booking, BOOKING_STATUS, BOOKING_PAYMENT_STATUS, BOOKING_PAYMENT_TYPE, USER_ROLE, ASSIGNMENT_TYPE, PAYMENT_TYPE } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

interface FindBookingsByRoleOptions {
  userId: number;
  userRole: USER_ROLE;
  purohitProfileId?: number;
  page?: number;
  limit?: number;
  status?: BOOKING_STATUS | BOOKING_STATUS[];
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
  search?: string;
}

@Injectable()
export class BookingRepository extends BaseRepository<Booking> {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {
    super(bookingRepo);
  }

  createQueryBuilder(alias: string): SelectQueryBuilder<Booking> {
    return this.bookingRepo.createQueryBuilder(alias);
  }

  async findBookingById(bookingId: number): Promise<Booking | null> {
    return this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin('booking.customer', 'customer')
      .addSelect([
        'customer.id',
        'customer.email',
        'customer.username',
        'customer.phone',
        'customer.firstName',
        'customer.lastName',
        'customer.profileImage',
        'customer.role',
        'customer.status',
        'customer.createdAt',
        'customer.updatedAt',
      ])
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoin('purohit.user', 'purohitUser')
      .addSelect([
        'purohitUser.id',
        'purohitUser.email',
        'purohitUser.username',
        'purohitUser.phone',
        'purohitUser.firstName',
        'purohitUser.lastName',
        'purohitUser.profileImage',
        'purohitUser.role',
        'purohitUser.status',
        'purohitUser.createdAt',
        'purohitUser.updatedAt',
      ])
      .leftJoinAndSelect('booking.customerAddress', 'customerAddress')
      .leftJoinAndSelect(
        'booking.payments',
        'payments',
        '(payments."paymentType" != :bookingPaymentType OR (payments."razorpayPaymentLinkId" IS NOT NULL AND payments."razorpayPaymentLinkId" != \'\'))',
        { bookingPaymentType: PAYMENT_TYPE.BOOKING_PAYMENT },
      )
      .leftJoinAndSelect('booking.complaints', 'complaints')
      .leftJoinAndSelect('purohit.bankAccounts', 'purohitBankAccounts')
      .where('booking.id = :bookingId', {
        bookingId,
      })
      .getOne();
  }

  async findBookingByNumber(bookingNumber: string): Promise<Booking | null> {
    return this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin('booking.customer', 'customer')
      .addSelect([
        'customer.id',
        'customer.email',
        'customer.username',
        'customer.phone',
        'customer.firstName',
        'customer.lastName',
        'customer.profileImage',
        'customer.role',
        'customer.status',
        'customer.createdAt',
        'customer.updatedAt',
      ])
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoin('purohit.user', 'purohitUser')
      .addSelect([
        'purohitUser.id',
        'purohitUser.email',
        'purohitUser.username',
        'purohitUser.phone',
        'purohitUser.firstName',
        'purohitUser.lastName',
        'purohitUser.profileImage',
        'purohitUser.role',
        'purohitUser.status',
      ])
      .leftJoinAndSelect('booking.customerAddress', 'customerAddress')
      .where('booking.bookingNumber = :bookingNumber', {
        bookingNumber,
      })
      .getOne();
  }

  async findBookingsByRole(options: FindBookingsByRoleOptions): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const {
      userId,
      userRole,
      purohitProfileId,
      page = 1,
      limit = 10,
      status,
      bookingPaymentStatus,
      purohitPayoutStatus,
      search,
    } = options;

    const skip = (page - 1) * limit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin('booking.customer', 'customer')
      .addSelect([
        'customer.id',
        'customer.email',
        'customer.username',
        'customer.phone',
        'customer.firstName',
        'customer.lastName',
        'customer.profileImage',
        'customer.role',
        'customer.status',
        'customer.createdAt',
        'customer.updatedAt',
      ])
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoin('purohit.user', 'purohitUser')
      .addSelect([
        'purohitUser.id',
        'purohitUser.email',
        'purohitUser.username',
        'purohitUser.phone',
        'purohitUser.firstName',
        'purohitUser.lastName',
        'purohitUser.profileImage',
        'purohitUser.role',
        'purohitUser.status',
      ])
      .leftJoinAndSelect('booking.customerAddress', 'customerAddress')
      .leftJoinAndSelect(
        'booking.payments',
        'payments',
        '(payments."paymentType" != :bookingPaymentType OR (payments."razorpayPaymentLinkId" IS NOT NULL AND payments."razorpayPaymentLinkId" != \'\'))',
        { bookingPaymentType: PAYMENT_TYPE.BOOKING_PAYMENT },
      )
      .leftJoinAndSelect('payments.purohitBankAccount', 'purohitBankAccount');

    switch (userRole) {
      case USER_ROLE.ADMIN:
        break;

      case USER_ROLE.CUSTOMER:
        query.andWhere('booking.customerId = :customerId', {
          customerId: userId,
        });
        break;

      case USER_ROLE.PUROHIT:
        if (!purohitProfileId) {
          query.andWhere('1 = 0');
          break;
        }

        query.andWhere('booking.purohitId = :purohitProfileId', {
          purohitProfileId,
        });
        break;

      default:
        query.andWhere('1 = 0');
        break;
    }

    if (status) {
      if (Array.isArray(status)) {
        query.andWhere('booking.status IN (:...status)', {
          status,
        });
      } else {
        query.andWhere('booking.status = :status', {
          status,
        });
      }
    }

    if (bookingPaymentStatus) {
      if (Array.isArray(bookingPaymentStatus)) {
        query.andWhere('booking.paymentStatus IN (:...bookingPaymentStatus)', {
          bookingPaymentStatus,
        });
      } else {
        query.andWhere('booking.paymentStatus = :bookingPaymentStatus', {
          bookingPaymentStatus,
        });
      }
    }

    if (purohitPayoutStatus) {
      if (Array.isArray(purohitPayoutStatus)) {
        query.andWhere(
          'booking.purohitPayoutStatus IN (:...purohitPayoutStatus)',
          {
            purohitPayoutStatus,
          },
        );
      } else {
        query.andWhere(
          'booking.purohitPayoutStatus = :purohitPayoutStatus',
          {
            purohitPayoutStatus,
          },
        );
      }
    }

    if (search?.trim()) {
      const normalizedSearch = search.trim();

      if (userRole === USER_ROLE.ADMIN) {
        query.andWhere(
          `(
            booking."bookingNumber" ILIKE :search
            OR service.name ILIKE :search
            OR customer."firstName" ILIKE :search
            OR customer."lastName" ILIKE :search
            OR customer.username ILIKE :search
            OR customer.email ILIKE :search
            OR customer.phone ILIKE :search
          )`,
          {
            search: `%${normalizedSearch}%`,
          },
        );
      } else {
        query.andWhere(
          `(
            booking."bookingNumber" ILIKE :search
            OR service.name ILIKE :search
          )`,
          {
            search: `%${normalizedSearch}%`,
          },
        );
      }
    }

    const [bookings, total] = await query
      .orderBy('booking.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      bookings,
      total,
    };
  }

  async findAvailableBookingsForPurohit(
    purohitId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const safePage = Math.max(page, 1);

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const skip = (safePage - 1) * safeLimit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin('booking.customer', 'customer')
      .addSelect([
        'customer.id',
        'customer.email',
        'customer.username',
        'customer.phone',
        'customer.firstName',
        'customer.lastName',
        'customer.profileImage',
        'customer.role',
        'customer.status',
      ])
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.customerAddress', 'customerAddress')
      .where('booking.status = :status', {
        status: BOOKING_STATUS.PENDING,
      })
      .andWhere('booking.assignmentType = :assignmentType', {
        assignmentType: ASSIGNMENT_TYPE.AUTO,
      })
      .andWhere('booking."purohitId" IS NULL')
      // TODO: Deprecated. Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
      // .andWhere('booking.paymentStatus IN (:...paidStatuses)', {
      //   paidStatuses: [
      //     BOOKING_PAYMENT_STATUS.PAID,
      //     BOOKING_PAYMENT_STATUS.PARTIAL,
      //     BOOKING_PAYMENT_STATUS.NOT_REQUIRED,
      //   ],
      // })
      .andWhere(
        '(booking.paymentStatus IN (:...paidStatuses) OR booking.paymentType = :deferredPaymentType)',
        {
          paidStatuses: [
            BOOKING_PAYMENT_STATUS.PAID,
            BOOKING_PAYMENT_STATUS.PARTIAL,
          ],
          deferredPaymentType: BOOKING_PAYMENT_TYPE.DEFERRED,
        },
      )
      .andWhere(
        `
        booking."filteredPurohitIds" IS NOT NULL
        AND booking."filteredPurohitIds"
          @> CAST(:purohitFilter AS jsonb)
        `,
        {
          purohitFilter: JSON.stringify([purohitId]),
        },
      )
      .andWhere(
        `
        EXISTS (
          SELECT 1
          FROM purohit_services ps
          WHERE ps."purohitId" = :purohitId
            AND ps."serviceId" =
              booking."serviceId"
            AND ps."isActive" = true
        )
        `,
        {
          purohitId,
        },
      )
      .andWhere(
        `
        EXISTS (
          SELECT 1
          FROM purohit_service_areas psa
          JOIN purohit_profiles pp ON pp."userId" = psa."purohitId"
          WHERE pp.id = :purohitId
            AND psa."deletedAt" IS NULL
            AND (
              LOWER(TRIM(psa.city)) = LOWER(TRIM("customerAddress"."city"))
              OR LOWER(TRIM(psa.city)) = LOWER(TRIM(booking."addressSnapshot"->>'city'))
            )
        )
        `,
        {
          purohitId,
        },
      );

    if (search?.trim()) {
      const normalizedSearch = search.trim();

      query.andWhere(
        `(
          booking."bookingNumber" ILIKE :search
          OR service.name ILIKE :search
        )`,
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    const [bookings, total] = await query
      .orderBy('booking.scheduledAt', 'ASC')
      .addOrderBy('booking.createdAt', 'DESC')
      .skip(skip)
      .take(safeLimit)
      .getManyAndCount();

    return {
      bookings,
      total,
    };
  }

  async bookingNumberExists(bookingNumber: string): Promise<boolean> {
    return this.bookingRepo.exists({
      where: {
        bookingNumber,
      },
    });
  }

  async saveBooking(booking: Booking): Promise<Booking> {
    return this.bookingRepo.save(booking);
  }

  async softDeleteBooking(bookingId: number): Promise<void> {
    await this.bookingRepo.softDelete(bookingId);
  }

  async findBookingByIdIncludingDeleted(
    bookingId: number,
  ): Promise<Booking | null> {
    return this.bookingRepo.findOne({
      where: {
        id: bookingId,
      },
      withDeleted: true,
    });
  }

  async restoreBooking(bookingId: number): Promise<void> {
    await this.bookingRepo.restore(bookingId);
  }

  async findActiveBookingsByRole(options: {
    userId: number;
    userRole: USER_ROLE;
    purohitProfileId?: number;
    page: number;
    limit: number;
    search?: string;
    activeStatuses: BOOKING_STATUS[];
    status?: BOOKING_STATUS | BOOKING_STATUS[];
  }): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const {
      userId,
      userRole,
      purohitProfileId,
      page,
      limit,
      search,
      activeStatuses,
    } = options;

    const skip = (page - 1) * limit;

    const queryBuilder = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin('booking.customer', 'customer')
      .leftJoin('booking.service', 'service')
      .leftJoin('booking.customerAddress', 'customerAddress')
      .leftJoin('booking.purohit', 'purohit')
      .leftJoin('purohit.user', 'purohitUser')
      .select([
        'booking.id',
        'booking.bookingNumber',
        'booking.customerId',
        'booking.serviceId',
        'booking.purohitId',
        'booking.customerAddressId',
        'booking.addressSnapshot',
        'booking.customerPincode',
        'booking.scheduledAt',
        'booking.specialInstructions',
        'booking.customFields',
        'booking.discountAmount',
        'booking.donationAmount',
        'booking.finalAmount',
        'booking.status',
        'booking.paymentStatus',
        'booking.assignmentType',
        'booking.couponCode',

        'customer.id',
        'customer.firstName',
        'customer.lastName',
        'customer.email',
        'customer.phone',
        'customer.profileImage',

        'service.id',
        'service.name',
        'service.iconUrl',
        'service.durationMinutes',

        'customerAddress.id',
        'customerAddress.addressLabel',
        'customerAddress.fullAddress',
        'customerAddress.city',
        'customerAddress.pincode',
        'customerAddress.latitude',
        'customerAddress.longitude',

        'purohit.id',
        'purohit.userId',
        'purohit.avgRating',

        'purohitUser.id',
        'purohitUser.firstName',
        'purohitUser.lastName',
        'purohitUser.email',
        'purohitUser.phone',
        'purohitUser.profileImage',
      ])
      .where('booking.status IN (:...activeStatuses)', {
        activeStatuses,
      });

    switch (userRole) {
      case USER_ROLE.ADMIN:
        break;

      case USER_ROLE.CUSTOMER:
        queryBuilder.andWhere('booking.customerId = :customerId', {
          customerId: userId,
        });
        break;

      case USER_ROLE.PUROHIT:
        if (!purohitProfileId) {
          return {
            bookings: [],
            total: 0,
          };
        }

        queryBuilder.andWhere('booking.purohitId = :purohitProfileId', {
          purohitProfileId,
        });
        break;

      default:
        return {
          bookings: [],
          total: 0,
        };
    }

    if (search?.trim()) {
      const normalizedSearch = search.trim();

      queryBuilder.andWhere(
        `
        (
          booking."bookingNumber" ILIKE :search
          OR service.name ILIKE :search
          OR customer."firstName" ILIKE :search
          OR customer."lastName" ILIKE :search
          OR purohitUser."firstName" ILIKE :search
          OR purohitUser."lastName" ILIKE :search
        )
        `,
        {
          search: `%${normalizedSearch}%`,
        },
      );
    }

    const [bookings, total] = await queryBuilder
      .orderBy('booking.scheduledAt', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      bookings,
      total,
    };
  }

  async markExpiredAsManual(): Promise<Booking[]> {
    const result = await this.bookingRepo
      .createQueryBuilder()
      .update(Booking)
      .set({
        assignmentType: ASSIGNMENT_TYPE.MANUAL,
      })
      .where('"status" = :status', {
        status: BOOKING_STATUS.PENDING,
      })
      .andWhere('"assignmentType" = :assignmentType', {
        assignmentType: ASSIGNMENT_TYPE.AUTO,
      })
      .andWhere('"purohitId" IS NULL')
      // TODO: Deprecated. Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
      // .andWhere('"paymentStatus" IN (:...paidStatuses)', {
      //   paidStatuses: [
      //     BOOKING_PAYMENT_STATUS.PAID,
      //     BOOKING_PAYMENT_STATUS.PARTIAL,
      //     BOOKING_PAYMENT_STATUS.NOT_REQUIRED,
      //   ],
      // })
      .andWhere(
        '("paymentStatus" IN (:...paidStatuses) OR "paymentType" = :deferredPaymentType)',
        {
          paidStatuses: [
            BOOKING_PAYMENT_STATUS.PAID,
            BOOKING_PAYMENT_STATUS.PARTIAL,
          ],
          deferredPaymentType: BOOKING_PAYMENT_TYPE.DEFERRED,
        },
      )
      .andWhere(
        `"createdAt" <= CURRENT_TIMESTAMP - INTERVAL '24 hours'`,
      )
      .returning('*')
      .execute();

    return result.raw as Booking[];
  }

  async getPurohitDashboardStats(purohitProfileId: number): Promise<{
    totalEarnings: number;
    thisMonthEarnings: number;
    thisWeekEarnings: number;
    totalActiveBookings: number;
    totalCompletedBookings: number;
  }> {
    const now = new Date();

    // Get start of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get start of week (assuming Monday is start of week)
    const day = now.getDay() || 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);

    const activeStatuses = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.ONGOING,
    ];

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .select('COALESCE(SUM(CASE WHEN booking.status = :completed AND booking."purohitPayoutStatus" = :payoutPaid THEN booking.purohitPayoutAmount ELSE 0 END), 0)', 'totalEarnings')
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking.scheduledAt >= :startOfMonth AND booking.status = :completed AND booking."purohitPayoutStatus" = :payoutPaid THEN booking.purohitPayoutAmount ELSE 0 END), 0)`,
        'thisMonthEarnings',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking.scheduledAt >= :startOfWeek AND booking.status = :completed AND booking."purohitPayoutStatus" = :payoutPaid THEN booking.purohitPayoutAmount ELSE 0 END), 0)`,
        'thisWeekEarnings',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking.status IN (:...activeStatuses) THEN 1 ELSE 0 END), 0)`,
        'totalActiveBookings',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking.status = :completed THEN 1 ELSE 0 END), 0)`,
        'totalCompletedBookings',
      )
      .where('booking.purohitId = :purohitId', { purohitId: purohitProfileId });

    const result = await query
      .setParameters({
        completed: BOOKING_STATUS.COMPLETED,
        payoutPaid: BOOKING_PAYMENT_STATUS.PAID,
        purohitId: purohitProfileId,
        startOfMonth,
        startOfWeek,
        activeStatuses,
      })
      .getRawOne();

    return {
      totalEarnings: Number(result.totalEarnings) || 0,
      thisMonthEarnings: Number(result.thisMonthEarnings) || 0,
      thisWeekEarnings: Number(result.thisWeekEarnings) || 0,
      totalActiveBookings: Number(result.totalActiveBookings) || 0,
      totalCompletedBookings: Number(result.totalCompletedBookings) || 0,
    };
  }

  async getCustomerDashboardStats(customerId: number): Promise<{
    totalBookings: number;
    pendingBookings: number;
    completedBookings: number;
  }> {
    const activeStatuses = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.ONGOING,
    ];

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .select('COUNT(*)', 'totalBookings')
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking.status IN (:...activeStatuses) THEN 1 ELSE 0 END), 0)`,
        'pendingBookings',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking.status = :completed THEN 1 ELSE 0 END), 0)`,
        'completedBookings',
      )
      .where('booking.customerId = :customerId', { customerId });

    const result = await query
      .setParameters({
        completed: BOOKING_STATUS.COMPLETED,
        customerId,
        activeStatuses,
      })
      .getRawOne();

    return {
      totalBookings: Number(result.totalBookings) || 0,
      pendingBookings: Number(result.pendingBookings) || 0,
      completedBookings: Number(result.completedBookings) || 0,
    };
  }

  async getAdminDashboardStats(): Promise<{
    totalBookings: number;
    totalRevenue: number;
  }> {
    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .select('COUNT(*)', 'totalBookings')
      .addSelect(
        `COALESCE(SUM(CASE WHEN booking."paymentStatus" = :paid THEN booking."finalAmount" ELSE 0 END), 0)`,
        'totalRevenue',
      );

    const result = await query
      .setParameters({
        paid: BOOKING_PAYMENT_STATUS.PAID,
      })
      .getRawOne();

    return {
      totalBookings: Number(result.totalBookings) || 0,
      totalRevenue: Number(result.totalRevenue) || 0,
    };
  }
}
