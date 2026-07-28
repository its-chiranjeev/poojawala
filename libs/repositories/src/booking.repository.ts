import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BOOKING_STATUS } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

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
    return this.bookingRepo.findOne({
      where: {
        id: bookingId,
      },
      relations: {
        customer: true,
        service: true,
        purohit: true,
        customerAddress: true,
        payments: true,
        review: true,
        complaints: true,
      },
    });
  }

  async findBookingByNumber(
    bookingNumber: string,
  ): Promise<Booking | null> {
    return this.bookingRepo.findOne({
      where: {
        bookingNumber,
      },
      relations: {
        customer: true,
        service: true,
        purohit: true,
        customerAddress: true,
      },
    });
  }

  async findCustomerBookings(
    customerId: number,
    page: number = 1,
    limit: number = 10,
    status?: BOOKING_STATUS,
  ): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const skip = (page - 1) * limit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      )
      .where('booking.customerId = :customerId', {
        customerId,
      });

    if (status) {
      query.andWhere('booking.status = :status', {
        status,
      });
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

  async findAllBookings(
    page: number = 1,
    limit: number = 10,
    status?: BOOKING_STATUS,
  ): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const skip = (page - 1) * limit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      );

    if (status) {
      query.andWhere('booking.status = :status', {
        status,
      });
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

  async findPurohitBookings(
    purohitId: number,
    page: number = 1,
    limit: number = 10,
    status?: BOOKING_STATUS,
  ): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const skip = (page - 1) * limit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      )
      .where('booking.purohitId = :purohitId', {
        purohitId,
      });

    if (status) {
      query.andWhere('booking.status = :status', {
        status,
      });
    }

    const [bookings, total] = await query
      .orderBy('booking.scheduledAt', 'ASC')
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
  ): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const skip = (page - 1) * limit;

    const query = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.service', 'service')
      .leftJoinAndSelect(
        'booking.customerAddress',
        'customerAddress',
      )
      .where('booking.status = :status', {
        status: BOOKING_STATUS.PENDING,
      })
      .andWhere('booking.purohitId IS NULL')
      .andWhere(
        'booking.filteredPurohitIds @> :purohitId',
        {
          purohitId: JSON.stringify([purohitId]),
        },
      );

    const [bookings, total] = await query
      .orderBy('booking.scheduledAt', 'ASC')
      .skip(skip)
      .take(limit)
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
    return this.bookingRepo.save(booking);
  }

  async deleteBookingById(
    bookingId: number,
  ): Promise<void> {
    await this.bookingRepo.delete(bookingId);
  }
}