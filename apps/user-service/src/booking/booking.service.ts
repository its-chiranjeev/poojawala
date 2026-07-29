import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ASSIGNMENT_TYPE, Booking, BOOKING_PAYMENT_STATUS, BOOKING_STATUS, CustomerAddress, Service, USER_ROLE, User , CANCELLED_BY, PurohitProfile, USER_STATUS, PUROHIT_VERIFICATION_STATUS, PurohitService } from '@likemyproduct/entities';
import { BookingRepository } from '@likemyproduct/repositories';
import { BookingQueryDto, CreateBookingDto, UpdateBookingDto, CancelBookingDto, RespondBookingDto, PUROHIT_BOOKING_ACTION, AssignBookingDto, UpdateBookingStatusDto } from '@likemyproduct/dtos';

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly dataSource: DataSource
    ) {}

  async createBooking(
    user: User,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can create bookings');
    }

    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new BadRequestException('Scheduled date and time must be in the future');
    }

    return this.dataSource.transaction(async (manager) => {
      const serviceRepository = manager.getRepository(Service);
      const addressRepository = manager.getRepository(CustomerAddress);
      const bookingRepository = manager.getRepository(Booking);
      const service = await serviceRepository.findOne({
        where: {
          id: dto.serviceId,
        },
      });

      if (!service) {
        throw new NotFoundException('Service not found');
      }

      if (!service.isActive) {
        throw new BadRequestException('Service is currently inactive');
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
          throw new NotFoundException('Customer address not found or does not belong to you');
        }
      }

      const minPrice = Number(service.minPrice);
      const maxPrice = Number(service.maxPrice);
      const commissionPercentage = Number(service.commissionPercentage);

      if (!Number.isFinite(minPrice) || minPrice <= 0) {
        throw new BadRequestException('A valid minimum price is not configured for this service');
      }

      if (!Number.isFinite(maxPrice) || maxPrice < minPrice) {
        throw new BadRequestException('A valid maximum price is not configured for this service',);
      }

      if (
        !Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100
      ) {
        throw new BadRequestException('A valid commission percentage is not configured for this service');
      }

      const agreedPrice = minPrice;
      const donationAmount = Number( dto.donationAmount ?? 0 );

      if (!Number.isFinite(donationAmount) || donationAmount < 0) {
        throw new BadRequestException('Donation amount must be zero or greater');
      }

      const discountAmount = 0;
      const platformCommission = Number((agreedPrice * (commissionPercentage / 100)).toFixed(2));
      const purohitPayoutAmount = Number(( agreedPrice - platformCommission ).toFixed(2));
      const finalAmount = Number(( agreedPrice - discountAmount + donationAmount ).toFixed(2));
      const booking = bookingRepository.create({
        bookingNumber: this.generateBookingNumber(),
        customerId: user.id,
        serviceId: service.id,
        customerAddressId: customerAddress?.id ?? undefined,
        addressSnapshot: customerAddress ? this.createAddressSnapshot(customerAddress) : undefined,
        customerPincode: this.getAddressPincode(customerAddress),
        scheduledAt,
        specialInstructions: dto.specialInstructions?.trim() || undefined,
        customFields: dto.customFields ?? undefined,
        agreedPrice,
        commissionPercentage,
        platformCommission,
        purohitPayoutAmount,
        couponCode: dto.couponCode?.trim() || undefined,
        discountAmount,
        donationAmount,
        finalAmount,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        assignmentType: ASSIGNMENT_TYPE.AUTO,
        filteredPurohitIds: [],
      });

      return bookingRepository.save(booking);
    });
  }

  async getBookings(
    user: User,
    query: BookingQueryDto,
  ): Promise<{
    bookings: Booking[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    if (
      user.role !== USER_ROLE.ADMIN &&
      user.role !== USER_ROLE.CUSTOMER &&
      user.role !== USER_ROLE.PUROHIT
    ) {
      throw new ForbiddenException(
        'You are not allowed to access bookings',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const status = query.status;
    const search = query.search?.trim();

    let purohitProfileId: number | undefined;

    if (user.role === USER_ROLE.PUROHIT) {
      const purohitProfile =
        await this.getPurohitProfile(user.id);

      purohitProfileId = purohitProfile.id;
    }

    const { bookings, total } =
      await this.bookingRepository.findBookingsByRole({
        userId: user.id,
        userRole: user.role,
        purohitProfileId,
        page,
        limit,
        status,
        search,
      });

    return {
      bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  private async getPurohitProfile(
    userId: number,
  ): Promise<PurohitProfile> {
    const purohitProfileRepository = this.dataSource.getRepository(PurohitProfile);
    const purohitProfile = await purohitProfileRepository.findOne({
        where: {
          userId,
        },
      });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }
    return purohitProfile;
  }

  async getBookingById(
    user: User,
    bookingId: number,
  ): Promise<Booking> {
    const booking = await this.bookingRepository.findBookingById(
        bookingId,
      );

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    switch (user.role) {
      case USER_ROLE.ADMIN:
        // Admin can access any booking.
        return booking;

      case USER_ROLE.CUSTOMER:
        // Customer can access only their own booking.
        if (booking.customerId !== user.id) {
          throw new ForbiddenException('You are not allowed to access this booking');
        }

        return booking;

      case USER_ROLE.PUROHIT: {
        const purohitProfileRepository = this.dataSource.getRepository(
            PurohitProfile,
          );

        const purohitProfile =
          await purohitProfileRepository.findOne({
            where: {
              userId: user.id,
            },
          });

        if (!purohitProfile) {
          throw new NotFoundException('Purohit profile not found');
        }

        /*
        * booking.purohitId contains
        * PurohitProfile.id, not User.id.
        */
        if (booking.purohitId !== purohitProfile.id) {
          throw new ForbiddenException('You are not allowed to access this booking');
        }

        return booking;
      }

      default:
        throw new ForbiddenException('You are not allowed to access this booking');
    }
  }

  async updateBooking(
    user: User,
    bookingId: number,
    dto: UpdateBookingDto,
  ): Promise<Booking> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can update bookings');
    }

    const booking =
      await this.getBookingById(
        user,
        bookingId,
      );

    if (booking.customerId !== user.id) {
      throw new ForbiddenException('You cannot update this booking');
    }

    const editableStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.ACCEPTED,
    ];

    if (!editableStatuses.includes(booking.status)) {
      throw new BadRequestException(`Booking cannot be updated when status is ${booking.status}`);
    }

    if (dto.scheduledAt !== undefined) {
      const scheduledAt = new Date(
        dto.scheduledAt,
      );

      if (
        Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()
      ) {
        throw new BadRequestException('Scheduled date and time must be in the future');
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
      booking.specialInstructions = dto.specialInstructions.trim() || undefined;
    }

    if (dto.customFields !== undefined) {
      booking.customFields = dto.customFields;
    }

    if (dto.couponCode !== undefined) {
      booking.couponCode = dto.couponCode.trim() || undefined;
    }

    if (dto.donationAmount !== undefined) {
      const donationAmount = Number(dto.donationAmount);

      if (!Number.isFinite(donationAmount) || donationAmount < 0) {
        throw new BadRequestException('Donation amount must be zero or greater');
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

    return this.bookingRepository.save(booking);
  }

  private validateCustomerCancellation(
    user: User,
    booking: Booking,
  ): void {
    if (booking.customerId !== user.id) {
      throw new ForbiddenException('You can only cancel your own booking');
    }

    const customerCancellableStatuses: BOOKING_STATUS[] =
      [
        BOOKING_STATUS.PENDING,
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.ENROUTE,
      ];

    if (!customerCancellableStatuses.includes(booking.status)) {
      throw new BadRequestException(`Customer cannot cancel a booking when status is ${booking.status}`);
    }
  }

  private async validatePurohitCancellation(
    manager: EntityManager,
    user: User,
    booking: Booking,
    cancellationReason?: string,
  ): Promise<void> {
    if (!cancellationReason?.trim()) {
      throw new BadRequestException('Cancellation reason is required when a Purohit cancels a booking');
    }

    const purohitProfileRepository = manager.getRepository(PurohitProfile);

    const purohitProfile =
      await purohitProfileRepository.findOne({
        where: {
          userId: user.id,
        },
      });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (!booking.purohitId) {
      throw new ForbiddenException('This booking is not assigned to any Purohit');
    }

    /*
    * booking.purohitId references PurohitProfile.id.
    * user.id references User.id.
    */
    if (booking.purohitId !== purohitProfile.id) {
      throw new ForbiddenException('You can only cancel bookings assigned to you');
    }

    const allowedStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
    ];

    if (!allowedStatuses.includes(booking.status)) {
      throw new BadRequestException(`Purohit cannot cancel a booking with status ${booking.status}`);
    }
  }

  private validateAdminCancellation(
    cancellationReason?: string,
  ): void {
    if (!cancellationReason) {
      throw new BadRequestException( 'Cancellation reason is required when an admin cancels a booking' );
    }
  }

  async cancelBooking(
    user: User,
    bookingId: number,
    dto: CancelBookingDto,
  ): Promise<{
    message: string;
    booking: Booking;
  }> {
    const allowedRoles: USER_ROLE[] = [
      USER_ROLE.CUSTOMER,
      USER_ROLE.PUROHIT,
      USER_ROLE.ADMIN,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        'You are not allowed to cancel bookings',
      );
    }

    const cancellationReason =
      dto.cancellationReason?.trim();

    return this.dataSource.transaction(
      async (manager) => {
        const bookingRepository =
          manager.getRepository(Booking);

        /*
        * Lock only the booking row.
        * Do not use LEFT JOIN with pessimistic lock.
        */
        const booking = await bookingRepository
          .createQueryBuilder('booking')
          .where(
            'booking.id = :bookingId',
            {
              bookingId,
            },
          )
          .setLock('pessimistic_write')
          .getOne();

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        if (
          booking.status ===
          BOOKING_STATUS.CANCELLED
        ) {
          throw new ConflictException(
            'Booking is already cancelled',
          );
        }

        if (
          booking.status ===
          BOOKING_STATUS.COMPLETED
        ) {
          throw new BadRequestException(
            'Completed bookings cannot be cancelled',
          );
        }

        let cancelledBy: CANCELLED_BY;
        let message =
          'Booking cancelled successfully';

        switch (user.role) {
          case USER_ROLE.CUSTOMER:
            this.validateCustomerCancellation(
              user,
              booking,
            );

            cancelledBy =
              CANCELLED_BY.CUSTOMER;

            booking.status =
              BOOKING_STATUS.CANCELLED;

            break;

          case USER_ROLE.PUROHIT:
            await this.validatePurohitCancellation(
              manager,
              user,
              booking,
              cancellationReason,
            );

            cancelledBy =
              CANCELLED_BY.PUROHIT;

            /*
            * Purohit cancellation should release
            * the booking for another Purohit.
            */
            booking.status =
              BOOKING_STATUS.PENDING;

            booking.purohitId = undefined;

            message =
              'Booking released successfully and is available for reassignment';

            break;

          case USER_ROLE.ADMIN:
            this.validateAdminCancellation(
              cancellationReason,
            );

            cancelledBy =
              CANCELLED_BY.ADMIN;

            booking.status =
              BOOKING_STATUS.CANCELLED;

            break;

          default:
            throw new ForbiddenException(
              'You are not allowed to cancel this booking',
            );
        }

        booking.cancelledBy =
          cancelledBy;

        booking.cancellationReason =
          cancellationReason || undefined;

        const savedBooking =
          await bookingRepository.save(
            booking,
          );

        return {
          message,
          booking: savedBooking,
        };
      },
    );
  }

  private async updateBookingAddress(
    booking: Booking,
    customerId: number,
    customerAddressId: number,
  ): Promise<void> {
    const addressRepository = this.dataSource.getRepository(CustomerAddress);

    const customerAddress = await addressRepository.findOne({
        where: {
          id: customerAddressId,
          customerId,
        },
      });

    if (!customerAddress) {
      throw new NotFoundException('Customer address not found or does not belong to you');
    }

    booking.customerAddressId =customerAddress.id;
    booking.addressSnapshot = this.createAddressSnapshot(customerAddress);
    booking.customerPincode = this.getAddressPincode(customerAddress);
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
      addressLine1: 'addressLine1' in address ? address.addressLine1 : undefined,
      addressLine2: 'addressLine2' in address ? address.addressLine2 : undefined,
      city: 'city' in address ? address.city : undefined,
      state: 'state' in address ? address.state : undefined,
      pincode: 'pincode' in address ? address.pincode : undefined,
      landmark: 'landmark' in address ? address.landmark : undefined,
      latitude: 'latitude' in address ? address.latitude : undefined,
      longitude: 'longitude' in address ? address.longitude : undefined,
    };
  }

  private getAddressPincode(
    address: CustomerAddress | null,
  ): string | undefined {
    if ( !address || !('pincode' in address)) {
      return undefined;
    }

    const pincode = address.pincode;

    if ( pincode === null || pincode === undefined) {
      return undefined;
    }
    return String(pincode);
  }

  async respondToBooking(
    user: User,
    bookingId: number,
    dto: RespondBookingDto,
  ): Promise<{
    message: string;
    booking?: Booking;
  }> {
    return this.dataSource.transaction(
      async (manager) => {
        const bookingRepository = manager.getRepository(Booking);
        const purohitProfileRepository = manager.getRepository(PurohitProfile);
        const purohitProfile =
          await purohitProfileRepository.findOne({
            where: {
              userId: user.id,
            },
          });

        if (!purohitProfile) {
          throw new NotFoundException('Purohit profile not found');
        }

        /*
        * Prevent two Purohits from accepting
        * the same booking simultaneously.
        */
        const booking = await bookingRepository
          .createQueryBuilder('booking')
          .setLock('pessimistic_write')
          .leftJoinAndSelect(
            'booking.customer',
            'customer',
          )
          .leftJoinAndSelect(
            'booking.service',
            'service',
          )
          .leftJoinAndSelect(
            'booking.customerAddress',
            'customerAddress',
          )
          .where('booking.id = :bookingId', {
            bookingId,
          })
          .getOne();

        if (!booking) {
          throw new NotFoundException(
            'Booking not found',
          );
        }

        /*
        * Only pending and unassigned bookings
        * can receive an accept/dismiss response.
        */
        if (booking.status !== BOOKING_STATUS.PENDING || booking.purohitId) {
          throw new ConflictException('This booking is no longer available');
        }

        const filteredPurohitIds = booking.filteredPurohitIds ?? [];

        /*
        * Purohit must be part of the eligible
        * Purohit list for this booking.
        */
        if (!filteredPurohitIds.includes(purohitProfile.id)) {
          throw new ForbiddenException('This booking is not available to you or has already been dismissed');
        }

        if (dto.action === PUROHIT_BOOKING_ACTION.ACCEPT) {
          booking.purohitId = purohitProfile.id;
          booking.status = BOOKING_STATUS.ACCEPTED;

          /*
          * Clear the list because the booking
          * is no longer available to anyone else.
          */
          booking.filteredPurohitIds = [];

          const acceptedBooking = await bookingRepository.save(booking);

          return {
            message: 'Booking accepted successfully',
            booking: acceptedBooking,
          };
        }

        if (dto.action === PUROHIT_BOOKING_ACTION.DISMISS) {
          /*
          * Remove only the current Purohit.
          * Other Purohits can still accept it.
          */
          booking.filteredPurohitIds = filteredPurohitIds.filter(
              (purohitId) => purohitId !== purohitProfile.id,
            );

          await bookingRepository.save(booking);

          return {
            message: 'Booking dismissed successfully',
          };
        }

        /*
        * Defensive validation, although IsEnum
        * already rejects invalid actions.
        */
        throw new BadRequestException('Invalid booking response action');
      },
    );
  }

  async assignBookingToPurohit(
    admin: User,
    bookingId: number,
    dto: AssignBookingDto,
  ): Promise<{
    message: string;
    booking: Booking;
  }> {
    if (admin.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only admins can assign bookings');
    }

    return this.dataSource.transaction(
      async (manager) => {
        const bookingRepository = manager.getRepository(Booking);
        const purohitProfileRepository = manager.getRepository(PurohitProfile);
        const purohitServiceRepository = manager.getRepository(PurohitService);

        /*
        * Lock only the booking row.
        * Do not add LEFT JOIN relations to this query.
        */
        const booking = await bookingRepository
          .createQueryBuilder('booking')
          .where(
            'booking.id = :bookingId',
            {
              bookingId,
            },
          )
          .setLock('pessimistic_write')
          .getOne();

        if (!booking) {
          throw new NotFoundException('Booking not found');
        }

        const assignableStatuses: BOOKING_STATUS[] = [ BOOKING_STATUS.PENDING ];

        if (!assignableStatuses.includes(booking.status)) {
          throw new BadRequestException(`Booking cannot be assigned when status is ${booking.status}`);
        }

        if (booking.purohitId) {
          throw new ConflictException('Booking is already assigned to a Purohit');
        }

        /*
        * Load the selected Purohit and user account.
        */
        const purohit = await purohitProfileRepository
            .createQueryBuilder('purohit')
            .innerJoinAndSelect(
              'purohit.user',
              'user',
            )
            .where(
              'purohit.id = :purohitId',
              {
                purohitId: dto.purohitId,
              },
            )
            .getOne();

        if (!purohit) {
          throw new NotFoundException('Purohit not found');
        }

        if (purohit.user.role !== USER_ROLE.PUROHIT) {
          throw new BadRequestException('Selected user is not a Purohit');
        }

        if (purohit.user.status !== USER_STATUS.ACTIVE) {
          throw new BadRequestException('Purohit account is not active');
        }

        if (purohit.verificationStatus !== PUROHIT_VERIFICATION_STATUS.APPROVED) {
          throw new BadRequestException('Purohit is not approved');
        }

        /*
        * Verify that the selected Purohit provides
        * the exact service required by the booking.
        */
        const matchingPurohitService =
          await purohitServiceRepository.findOne({
            where: {
              purohitId: purohit.id,
              serviceId: booking.serviceId,
              isActive: true,
            },
          });

        if (!matchingPurohitService) {
          throw new BadRequestException('Selected Purohit does not provide the service required for this booking');
        }

        /*
        * Optional:
        * Prevent assigning a Purohit who previously
        * rejected or cancelled this booking.
        */
        if (booking.filteredPurohitIds?.includes(purohit.id)
        ) {
          throw new BadRequestException('This Purohit is not eligible for this booking');
        }

        booking.purohitId = purohit.id;
        booking.status = BOOKING_STATUS.ACCEPTED;
        booking.assignmentType = ASSIGNMENT_TYPE.MANUAL;

        const savedBooking =
          await bookingRepository.save(booking);

        /*
        * Reload relations after saving.
        * No pessimistic lock is applied here.
        */
        const assignedBooking =
          await bookingRepository.findOne({
            where: {
              id: savedBooking.id,
            },
            relations: {
              customer: true,
              service: true,
              purohit: {
                user: true,
              },
              customerAddress: true,
            },
          });

        return {
          message:'Booking assigned to Purohit successfully',
          booking: assignedBooking ?? savedBooking,
        };
      },
    );
  }

  async getAvailableBookings(
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
    if (user.role !== USER_ROLE.PUROHIT) {
      throw new ForbiddenException('Only Purohits can view available bookings');
    }
    const purohitProfileRepository = this.dataSource.getRepository(PurohitProfile);
    const purohitProfile = await purohitProfileRepository.findOne({
        where: {
          userId: user.id,
        },
        relations: {
          user: true,
        },
      });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    /*
    * Use these checks only when the corresponding
    * fields exist in your entities.
    */
    if (purohitProfile.user?.status !== USER_STATUS.ACTIVE) {
      throw new ForbiddenException('Your Purohit account is not active');
    }

    if (purohitProfile.verificationStatus !== PUROHIT_VERIFICATION_STATUS.APPROVED) {
      throw new ForbiddenException('Your Purohit profile is not approved');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { bookings, total } =
      await this.bookingRepository
        .findAvailableBookingsForPurohit(
          purohitProfile.id,
          page,
          limit,
          query.search?.trim(),
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

  async updateBookingStatus(
    user: User,
    bookingId: number,
    dto: UpdateBookingStatusDto,
  ) {
    const booking =
      await this.bookingRepository.findBookingById(
        bookingId,
      );

    if (!booking) {
      throw new NotFoundException(
        'Booking not found',
      );
    }

    await this.validateStatusUpdateAccess(
      user,
      booking,
    );

    this.validateStatusTransition(
      booking.status,
      dto.status,
    );

    booking.status = dto.status;

    switch (dto.status) {
      case BOOKING_STATUS.COMPLETED:
        booking.completionConfirmedAt =
          new Date();
        break;

      default:
        break;
    }

    const updatedBooking =
      await this.bookingRepository.saveBooking(
        booking,
      );

    return {
      message:
        'Booking status updated successfully',
      booking: updatedBooking,
    };
  }

  private validateStatusTransition(
    currentStatus: BOOKING_STATUS,
    nextStatus: BOOKING_STATUS,
  ): void {
    const allowedTransitions: Partial<
      Record<BOOKING_STATUS, BOOKING_STATUS[]>
    > = {
      // [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.ACCEPTED],
      [BOOKING_STATUS.ACCEPTED]: [BOOKING_STATUS.ENROUTE],
      [BOOKING_STATUS.ENROUTE]: [BOOKING_STATUS.ARRIVED],
      [BOOKING_STATUS.ARRIVED]: [BOOKING_STATUS.ONGOING],
      [BOOKING_STATUS.ONGOING]: [BOOKING_STATUS.COMPLETED],
    };

    const allowedNextStatuses = allowedTransitions[currentStatus] ?? [];

    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(`Booking status cannot be changed from ${currentStatus} to ${nextStatus}`);
    }
  }

  private async validateStatusUpdateAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    switch (user.role) {
      case USER_ROLE.ADMIN:
        return;

      case USER_ROLE.PUROHIT: await this.validateAssignedPurohit(
          user.id,
          booking,
        );
        return;

      default: throw new ForbiddenException('You are not allowed to update booking status');
    }
  }

  private async validateAssignedPurohit(
    userId: number,
    booking: Booking,
  ): Promise<void> {
    const purohitProfile = await this.dataSource
      .getRepository(PurohitProfile)
      .findOne({
        where: {
          userId,
        },
      });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (booking.purohitId !== purohitProfile.id) {
      throw new ForbiddenException('You are not assigned to this booking');
    }
  }
}