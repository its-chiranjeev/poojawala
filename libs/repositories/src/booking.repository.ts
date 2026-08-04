import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BOOKING_STATUS, USER_ROLE } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

interface FindBookingsByRoleOptions {
  userId: number;
  userRole: USER_ROLE;
  purohitProfileId?: number;
  page?: number;
  limit?: number;
  status?: BOOKING_STATUS;
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

  async findBookingById(
    bookingId: number,
  ): Promise<Booking | null> {
    return this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin(
        'booking.customer',
        'customer',
      )
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
      .leftJoinAndSelect(
        'booking.service',
        'service',
      )
      .leftJoinAndSelect(
        'booking.purohit',
        'purohit',
      )
      .leftJoin(
        'purohit.user',
        'purohitUser',
      )
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
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      )
      .leftJoinAndSelect(
        'booking.payments',
        'payments',
      )
      .leftJoinAndSelect(
        'booking.review',
        'review',
      )
      .leftJoinAndSelect(
        'booking.complaints',
        'complaints',
      )
      .where('booking.id = :bookingId', {
        bookingId,
      })
      .getOne();
  }

  async findBookingByNumber(
    bookingNumber: string,
  ): Promise<Booking | null> {
    return this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin(
        'booking.customer',
        'customer',
      )
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
      .leftJoinAndSelect(
        'booking.service',
        'service',
      )
      .leftJoinAndSelect(
        'booking.purohit',
        'purohit',
      )
      .leftJoin(
        'purohit.user',
        'purohitUser',
      )
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
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      )
      .where(
        'booking.bookingNumber = :bookingNumber',
        {
          bookingNumber,
        },
      )
      .getOne();
  }

  async findBookingsByRole(
    options: FindBookingsByRoleOptions,
  ): Promise<{
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
      search,
    } = options;

    const skip = (page - 1) * limit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin(
        'booking.customer',
        'customer',
      )
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
      .leftJoinAndSelect(
        'booking.service',
        'service',
      )
      .leftJoinAndSelect(
        'booking.purohit',
        'purohit',
      )
      .leftJoin(
        'purohit.user',
        'purohitUser',
      )
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
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      );

    switch (userRole) {
      case USER_ROLE.ADMIN:
        break;

      case USER_ROLE.CUSTOMER:
        query.andWhere(
          'booking.customerId = :customerId',
          {
            customerId: userId,
          },
        );
        break;

      case USER_ROLE.PUROHIT:
        if (!purohitProfileId) {
          query.andWhere('1 = 0');
          break;
        }

        query.andWhere(
          'booking.purohitId = :purohitProfileId',
          {
            purohitProfileId,
          },
        );
        break;

      default:
        query.andWhere('1 = 0');
        break;
    }

    if (status) {
      query.andWhere(
        'booking.status = :status',
        {
          status,
        },
      );
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

    const [bookings, total] =
      await query
        .orderBy(
          'booking.createdAt',
          'DESC',
        )
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
    const safeLimit = Math.min(Math.max(limit, 1),100,);
    const skip = (safePage - 1) * safeLimit;
    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoin(
        'booking.customer',
        'customer',
      )
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
      .leftJoinAndSelect(
        'booking.service',
        'service',
      )
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      )
      .where(
        'booking.status = :status',
        {
          status:
            BOOKING_STATUS.PENDING,
        },
      )
      .andWhere(
        'booking."purohitId" IS NULL',
      )
      .andWhere(
        `
        booking."filteredPurohitIds" IS NOT NULL
        AND booking."filteredPurohitIds"
          @> CAST(:purohitFilter AS jsonb)
        `,
        {
          purohitFilter:
            JSON.stringify([
              purohitId,
            ]),
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
          search:
            `%${normalizedSearch}%`,
        },
      );
    }

    const [bookings, total] = await query
        .orderBy(
          'booking.scheduledAt',
          'ASC',
        )
        .addOrderBy(
          'booking.createdAt',
          'DESC',
        )
        .skip(skip)
        .take(safeLimit)
        .getManyAndCount();

    return {
      bookings,
      total,
    };
  }

  async bookingNumberExists(
    bookingNumber: string,
  ): Promise<boolean> {
    return this.bookingRepo.exists({
      where: {
        bookingNumber,
      },
    });
  }

  async saveBooking(
    booking: Booking,
  ): Promise<Booking> {
    return this.bookingRepo.save(
      booking,
    );
  }

  async softDeleteBooking(
    bookingId: number,
  ): Promise<void> {
    await this.repo.softDelete(bookingId);
  }

  async findBookingByIdIncludingDeleted(
    bookingId: number,
  ): Promise<Booking | null> {
    return this.repo.findOne({
      where: {
        id: bookingId,
      },
      withDeleted: true,
    });
  }

  async restoreBooking(
    bookingId: number,
  ): Promise<void> {
    await this.repo.restore(bookingId);
  }
}