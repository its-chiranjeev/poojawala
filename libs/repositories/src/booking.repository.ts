import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Booking, BOOKING_STATUS, BOOKING_PAYMENT_STATUS, USER_ROLE, ASSIGNMENT_TYPE } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

interface FindBookingsByRoleOptions {
  userId: number;
  userRole: USER_ROLE;
  purohitProfileId?: number;
  page?: number;
  limit?: number;
  status?: BOOKING_STATUS;
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS;
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS;
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
      .leftJoinAndSelect('booking.payments', 'payments')
      .leftJoinAndSelect('booking.complaints', 'complaints')
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
      .leftJoinAndSelect('booking.payments', 'payments')
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
      query.andWhere('booking.status = :status', {
        status,
      });
    }

    if (bookingPaymentStatus) {
      query.andWhere('booking.paymentStatus = :bookingPaymentStatus', {
        bookingPaymentStatus,
      });
    }

    if (purohitPayoutStatus) {
      query.andWhere('booking.purohitPayoutStatus = :purohitPayoutStatus', {
        purohitPayoutStatus,
      });
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
      .andWhere('booking."purohitId" IS NULL')
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
        'booking.agreedPrice',
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

  async markExpiredAsManual(): Promise<number> {
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
      .andWhere(
        `"createdAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'`,
      )
      .execute();

    return result.affected ?? 0;
  }
}
