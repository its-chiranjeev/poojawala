import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  ASSIGNMENT_TYPE,
  Booking,
  BOOKING_PAYMENT_STATUS,
  BOOKING_STATUS,
  CustomerAddress,
  Service,
  USER_ROLE,
  User,
} from '@likemyproduct/entities';

import { BookingRepository } from '@likemyproduct/repositories';

import {
  BookingQueryDto,
  CreateBookingDto,
  UpdateBookingDto,
} from '@likemyproduct/dtos';

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly dataSource: DataSource,
  ) {}

  async createBooking(
    user: User,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers can create bookings',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);

    if (
      Number.isNaN(scheduledAt.getTime()) ||
      scheduledAt <= new Date()
    ) {
      throw new BadRequestException(
        'Scheduled date and time must be in the future',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const serviceRepository =
        manager.getRepository(Service);

      const addressRepository =
        manager.getRepository(CustomerAddress);

      const bookingRepository =
        manager.getRepository(Booking);

      const service = await serviceRepository.findOne({
        where: {
          id: dto.serviceId,
        },
      });

      if (!service) {
        throw new NotFoundException('Service not found');
      }

      if (!service.isActive) {
        throw new BadRequestException(
          'Service is currently inactive',
        );
      }

      let customerAddress: CustomerAddress | null = null;

      if (dto.customerAddressId !== undefined) {
        customerAddress = await addressRepository.findOne({
          where: {
            id: dto.customerAddressId,
            customerId: user.id,
          },
        });

        if (!customerAddress) {
          throw new NotFoundException(
            'Customer address not found or does not belong to you',
          );
        }
      }

      const minPrice = Number(service.minPrice);
      const maxPrice = Number(service.maxPrice);
      const commissionPercentage = Number(
        service.commissionPercentage,
      );

      if (
        !Number.isFinite(minPrice) ||
        minPrice <= 0
      ) {
        throw new BadRequestException(
          'A valid minimum price is not configured for this service',
        );
      }

      if (
        !Number.isFinite(maxPrice) ||
        maxPrice < minPrice
      ) {
        throw new BadRequestException(
          'A valid maximum price is not configured for this service',
        );
      }

      if (
        !Number.isFinite(commissionPercentage) ||
        commissionPercentage < 0 ||
        commissionPercentage > 100
      ) {
        throw new BadRequestException(
          'A valid commission percentage is not configured for this service',
        );
      }

      const agreedPrice = minPrice;

      const donationAmount = Number(
        dto.donationAmount ?? 0,
      );

      if (
        !Number.isFinite(donationAmount) ||
        donationAmount < 0
      ) {
        throw new BadRequestException(
          'Donation amount must be zero or greater',
        );
      }

      const discountAmount = 0;

      const platformCommission = Number(
        (
          agreedPrice *
          (commissionPercentage / 100)
        ).toFixed(2),
      );

      const purohitPayoutAmount = Number(
        (
          agreedPrice -
          platformCommission
        ).toFixed(2),
      );

      const finalAmount = Number(
        (
          agreedPrice -
          discountAmount +
          donationAmount
        ).toFixed(2),
      );

      const booking = bookingRepository.create({
        bookingNumber: this.generateBookingNumber(),

        customerId: user.id,
        serviceId: service.id,

        customerAddressId:
          customerAddress?.id ?? undefined,

        addressSnapshot: customerAddress
          ? this.createAddressSnapshot(customerAddress)
          : undefined,

        customerPincode:
          this.getAddressPincode(customerAddress),

        scheduledAt,

        specialInstructions:
          dto.specialInstructions?.trim() || undefined,

        customFields:
          dto.customFields ?? undefined,

        agreedPrice,
        commissionPercentage,
        platformCommission,
        purohitPayoutAmount,

        couponCode:
          dto.couponCode?.trim() || undefined,

        discountAmount,
        donationAmount,
        finalAmount,

        status: BOOKING_STATUS.PENDING,

        paymentStatus:
          BOOKING_PAYMENT_STATUS.PENDING,

        assignmentType:
          ASSIGNMENT_TYPE.AUTO,

        filteredPurohitIds: [],
      });

      return bookingRepository.save(booking);
    });
  }

  async getMyBookings(
    user: User,
    query: BookingQueryDto,
  ): Promise<{
    bookings: Booking[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers can access their bookings',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const status = query.status;

    const { bookings, total } =
      await this.bookingRepository.findCustomerBookings(
        user.id,
        page,
        limit,
        status,
      );

    return {
      bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages:
          total === 0
            ? 0
            : Math.ceil(total / limit),
      },
    };
  }

  async getBookingById(
    user: User,
    bookingId: number,
  ): Promise<Booking> {
    const booking =
      await this.bookingRepository.findBookingById(
        bookingId,
      );

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    this.validateBookingAccess(user, booking);

    return booking;
  }

  async updateBooking(
    user: User,
    bookingId: number,
    dto: UpdateBookingDto,
  ): Promise<Booking> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers can update bookings',
      );
    }

    const booking =
      await this.getBookingById(
        user,
        bookingId,
      );

    if (booking.customerId !== user.id) {
      throw new ForbiddenException(
        'You cannot update this booking',
      );
    }

    const editableStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.ACCEPTED,
    ];

    if (!editableStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Booking cannot be updated when status is ${booking.status}`,
      );
    }

    if (dto.scheduledAt !== undefined) {
      const scheduledAt = new Date(
        dto.scheduledAt,
      );

      if (
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt <= new Date()
      ) {
        throw new BadRequestException(
          'Scheduled date and time must be in the future',
        );
      }

      booking.scheduledAt = scheduledAt;
    }

    if (dto.customerAddressId !== undefined) {
      await this.updateBookingAddress(
        booking,
        user.id,
        dto.customerAddressId,
      );
    }

    if (dto.specialInstructions !== undefined) {
      booking.specialInstructions =
        dto.specialInstructions.trim() || undefined;
    }

    if (dto.customFields !== undefined) {
      booking.customFields = dto.customFields;
    }

    if (dto.couponCode !== undefined) {
      booking.couponCode =
        dto.couponCode.trim() || undefined;
    }

    if (dto.donationAmount !== undefined) {
      const donationAmount = Number(
        dto.donationAmount,
      );

      if (
        !Number.isFinite(donationAmount) ||
        donationAmount < 0
      ) {
        throw new BadRequestException(
          'Donation amount must be zero or greater',
        );
      }

      booking.donationAmount = donationAmount;

      booking.finalAmount = Number(
        (
          Number(booking.agreedPrice) -
          Number(booking.discountAmount ?? 0) +
          donationAmount
        ).toFixed(2),
      );
    }

    return this.bookingRepository.save(
      booking,
    );
  }

  async deleteBooking(
    user: User,
    bookingId: number,
  ): Promise<{ message: string }> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers can delete bookings',
      );
    }

    const booking =
      await this.getBookingById(
        user,
        bookingId,
      );

    if (booking.customerId !== user.id) {
      throw new ForbiddenException(
        'You cannot delete this booking',
      );
    }

    if (booking.status !== BOOKING_STATUS.PENDING) {
      throw new BadRequestException(
        'Only pending bookings can be deleted',
      );
    }

    await this.bookingRepository.delete(
      bookingId,
    );

    return {
      message: 'Booking deleted successfully',
    };
  }

  async getAllBookings(
    user: User,
    query: BookingQueryDto,
  ): Promise<{
    bookings: Booking[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    if (user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException(
        'Only admins can access all bookings',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const status = query.status;

    const { bookings, total } =
      await this.bookingRepository.findAllBookings(
        page,
        limit,
        status,
      );

    return {
      bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages:
          total === 0
            ? 0
            : Math.ceil(total / limit),
      },
    };
  }

  private async updateBookingAddress(
    booking: Booking,
    customerId: number,
    customerAddressId: number,
  ): Promise<void> {
    const addressRepository =
      this.dataSource.getRepository(
        CustomerAddress,
      );

    const customerAddress =
      await addressRepository.findOne({
        where: {
          id: customerAddressId,
          customerId,
        },
      });

    if (!customerAddress) {
      throw new NotFoundException(
        'Customer address not found or does not belong to you',
      );
    }

    booking.customerAddressId =
      customerAddress.id;

    booking.addressSnapshot =
      this.createAddressSnapshot(
        customerAddress,
      );

    booking.customerPincode =
      this.getAddressPincode(
        customerAddress,
      );
  }

  private validateBookingAccess(
    user: User,
    booking: Booking,
  ): void {
    if (
      user.role === USER_ROLE.CUSTOMER &&
      booking.customerId !== user.id
    ) {
      throw new ForbiddenException(
        'You cannot access this booking',
      );
    }
  }

  private generateBookingNumber(): string {
    const timestamp = Date.now().toString().slice(-10);

    const randomNumber = Math.floor(
        1000 + Math.random() * 9000,
    );

    return `PW${timestamp}${randomNumber}`;
  }

  private createAddressSnapshot(
    address: CustomerAddress,
  ): Record<string, unknown> {
    return {
      id: address.id,

      addressLine1:
        'addressLine1' in address
          ? address.addressLine1
          : undefined,

      addressLine2:
        'addressLine2' in address
          ? address.addressLine2
          : undefined,

      city:
        'city' in address
          ? address.city
          : undefined,

      state:
        'state' in address
          ? address.state
          : undefined,

      pincode:
        'pincode' in address
          ? address.pincode
          : undefined,

      landmark:
        'landmark' in address
          ? address.landmark
          : undefined,

      latitude:
        'latitude' in address
          ? address.latitude
          : undefined,

      longitude:
        'longitude' in address
          ? address.longitude
          : undefined,
    };
  }

  private getAddressPincode(
    address: CustomerAddress | null,
  ): string | undefined {
    if (
      !address ||
      !('pincode' in address)
    ) {
      return undefined;
    }

    const pincode = address.pincode;

    if (
      pincode === null ||
      pincode === undefined
    ) {
      return undefined;
    }

    return String(pincode);
  }
}