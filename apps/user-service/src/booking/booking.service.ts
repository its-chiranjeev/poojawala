import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, Repository  } from 'typeorm';
import { ASSIGNMENT_TYPE, Booking, BOOKING_PAYMENT_STATUS, BOOKING_STATUS, CustomerAddress, Service, USER_ROLE, User , CANCELLED_BY, PurohitProfile, USER_STATUS, PUROHIT_VERIFICATION_STATUS, PurohitService, PurohitServiceArea } from '@likemyproduct/entities';
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
    /*
    * Initial role validation from authenticated user.
    */
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can create bookings');
    }

    /*
    * Validate scheduled date format.
    */
    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    /*
    * Booking must be created at least 2 hours in advance.
    *
    * Add to .env:
    * BOOKING_MIN_LEAD_TIME_MINUTES=120
    */
    const minimumLeadTimeMinutes = Number(
      process.env['BOOKING_MIN_LEAD_TIME_MINUTES'] ?? 120,
    );

    if (!Number.isFinite(minimumLeadTimeMinutes) || minimumLeadTimeMinutes < 0) {
      throw new BadRequestException('Invalid booking minimum lead-time configuration');
    }

    const minimumScheduledAt = new Date(
      Date.now() + minimumLeadTimeMinutes * 60 * 1000,
    );

    if (scheduledAt < minimumScheduledAt) {
      throw new BadRequestException(`Booking must be scheduled at least ${minimumLeadTimeMinutes} minutes in advance`);
    }

    /*
    * Prevent bookings too far into the future.
    *
    * Add to .env:
    * BOOKING_MAX_ADVANCE_DAYS=180
    */
    const maximumAdvanceDays = Number(
      process.env['BOOKING_MAX_ADVANCE_DAYS'] ?? 180,
    );

    if (!Number.isFinite(maximumAdvanceDays) || maximumAdvanceDays <= 0) {
      throw new BadRequestException('Invalid maximum booking advance-days configuration');
    }

    const maximumScheduledAt = new Date(
      Date.now() + maximumAdvanceDays * 24 * 60 * 60 * 1000,
    );

    if (scheduledAt > maximumScheduledAt) {
      throw new BadRequestException(`Booking cannot be scheduled more than ${maximumAdvanceDays} days in advance`);
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const serviceRepository = manager.getRepository(Service);
      const addressRepository = manager.getRepository(CustomerAddress);
      const bookingRepository = manager.getRepository(Booking);
      const purohitProfileRepository = manager.getRepository(PurohitProfile);

      /*
      * Reload customer from database.
      *
      * This prevents an inactive, blocked or deleted customer
      * from creating a booking using an old JWT.
      */
      const customer = await userRepository.findOne({
        where: {
          id: user.id,
          role: USER_ROLE.CUSTOMER,
          status: USER_STATUS.ACTIVE,
        },
      });

      if (!customer) {
        throw new ForbiddenException('Only active customers can create bookings');
      }

      /*
      * Validate selected service.
      */
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

      /*
      * Current flow is for offline bookings, so address
      * is required.
      */
      if (!dto.customerAddressId) {
        throw new BadRequestException('Customer address is required for booking');
      }

      /*
      * Validate that the address belongs to this customer.
      *
      * TypeORM automatically ignores soft-deleted addresses
      * unless withDeleted is explicitly enabled.
      */
      const customerAddress =
        await addressRepository.findOne({
          where: {
            id: dto.customerAddressId,
            customerId: customer.id,
          },
        });

      if (!customerAddress) {
        throw new NotFoundException('Customer address not found or does not belong to you');
      }

      const customerPincode = customerAddress.pincode?.trim();

      if (!customerPincode) {
        throw new BadRequestException('A valid pincode is required in the selected customer address');
      }

      /*
      * Validate coordinates.
      *
      * They are not currently used for radius filtering because
      * PurohitServiceArea has no serviceRadiusKm column, but
      * validating them now keeps address data ready for future
      * distance matching.
      */
      const customerLatitude = Number(customerAddress.latitude);
      const customerLongitude = Number(customerAddress.longitude);

      if (!Number.isFinite(customerLatitude) || customerLatitude < -90 || customerLatitude > 90
      ) {
        throw new BadRequestException('Selected customer address does not have a valid latitude');
      }

      if (!Number.isFinite(customerLongitude) || customerLongitude < -180 || customerLongitude > 180
      ) {
        throw new BadRequestException('Selected customer address does not have a valid longitude');
      }

      /*
      * Validate service pricing.
      */
      const minPrice = Number(service.minPrice);
      const maxPrice = Number(service.maxPrice);

      const commissionPercentage = Number(service.commissionPercentage);

      if (!Number.isFinite(minPrice) || minPrice <= 0) {
        throw new BadRequestException('A valid minimum price is not configured for this service');
      }

      if (!Number.isFinite(maxPrice) || maxPrice < minPrice) {
        throw new BadRequestException('A valid maximum price is not configured for this service');
      }

      if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100) {
        throw new BadRequestException('A valid commission percentage is not configured for this service');
      }

      const donationAmount = Number(dto.donationAmount ?? 0);

      if (!Number.isFinite(donationAmount) ||  donationAmount < 0) {
        throw new BadRequestException('Donation amount must be zero or greater');
      }

      /*
      * Currently coupons are not implemented.
      *
      * Do not silently store a coupon without validating and
      * applying it.
      */
      const couponCode =
        dto.couponCode?.trim();

      if (couponCode) {
        throw new BadRequestException('Coupon functionality is not currently available');
      }

      /*
      * Prevent duplicate active bookings for exactly the same
      * customer, service and scheduled time.
      */
      const duplicateBooking =
        await bookingRepository
          .createQueryBuilder('booking')
          .where(
            'booking.customerId = :customerId',
            {
              customerId: customer.id,
            },
          )
          .andWhere(
            'booking.serviceId = :serviceId',
            {
              serviceId: service.id,
            },
          )
          .andWhere(
            'booking.scheduledAt = :scheduledAt',
            {
              scheduledAt,
            },
          )
          .andWhere(
            'booking.status IN (:...statuses)',
            {
              statuses: [
                BOOKING_STATUS.PENDING,
                BOOKING_STATUS.ACCEPTED,
                BOOKING_STATUS.ENROUTE,
                BOOKING_STATUS.ARRIVED,
                BOOKING_STATUS.ONGOING,
              ],
            },
          )
          .getOne();

      if (duplicateBooking) {
        throw new ConflictException('A booking for this service and scheduled time already exists');
      }

      /*
      * Find Purohits who:
      *
      * 1. Provide the selected service.
      * 2. Have an active PurohitService record.
      * 3. Have APPROVED profile verification.
      * 4. Have ACTIVE user status.
      * 5. Are available for offline bookings.
      * 6. Serve the customer's pincode.
      *
      * Select profile.id because:
      * Booking.purohitId references PurohitProfile.id.
      */
      const matchingPurohits =
        await purohitProfileRepository
          .createQueryBuilder('profile')
          .innerJoin(
            'profile.user',
            'purohit_user',
          )
          .innerJoin(
            'profile.purohitServices',
            'purohit_service',
            `
              purohit_service.serviceId = :serviceId
              AND purohit_service.isActive = :isServiceActive
            `,
            {
              serviceId: service.id,
              isServiceActive: true,
            },
          )
          .innerJoin(
            PurohitServiceArea,
            'service_area',
            `
              service_area.purohitId = purohit_user.id
              AND service_area.pincode = :customerPincode
            `,
            {
              customerPincode,
            },
          )
          .where(
            'profile.verificationStatus = :verificationStatus',
            {
              verificationStatus:
                PUROHIT_VERIFICATION_STATUS.APPROVED,
            },
          )
          .andWhere(
            'profile.isOfflineAvailable = :isOfflineAvailable',
            {
              isOfflineAvailable: true,
            },
          )
          .andWhere(
            'purohit_user.role = :purohitRole',
            {
              purohitRole: USER_ROLE.PUROHIT,
            },
          )
          .andWhere(
            'purohit_user.status = :purohitUserStatus',
            {
              purohitUserStatus: USER_STATUS.ACTIVE,
            },
          )
          .select(
            'profile.id',
            'purohitProfileId',
          )
          .distinct(true)
          .getRawMany<{
            purohitProfileId: string;
          }>();

      const matchingPurohitIds = [
        ...new Set(
          matchingPurohits
            .map(({ purohitProfileId }) =>
              Number(purohitProfileId),
            )
            .filter((id) =>
              Number.isInteger(id),
            ),
        ),
      ];

      /*
      * Exclude Purohits who already have another active booking
      * close to this scheduled time.
      *
      * Temporary assumption:
      * Each booking occupies a four-hour window:
      * two hours before and two hours after scheduledAt.
      *
      * Later, use PurohitService.durationMinutes to calculate
      * a more accurate overlap window.
      */
      let availablePurohitIds = matchingPurohitIds;

      if (matchingPurohitIds.length > 0) {
        const conflictWindowMinutes = Number(process.env['BOOKING_CONFLICT_WINDOW_MINUTES'] ?? 120,
        );

        if (!Number.isFinite(conflictWindowMinutes) || conflictWindowMinutes < 0) {
          throw new BadRequestException('Invalid booking conflict-window configuration');
        }

        const conflictStart = new Date(scheduledAt.getTime() - conflictWindowMinutes * 60 * 1000);
        const conflictEnd = new Date(scheduledAt.getTime() + conflictWindowMinutes * 60 * 1000);

        const busyPurohits =
          await bookingRepository
            .createQueryBuilder('booking')
            .select(
              'booking.purohitId',
              'purohitId',
            )
            .where(
              'booking.purohitId IN (:...purohitIds)',
              {
                purohitIds:
                  matchingPurohitIds,
              },
            )
            .andWhere(
              'booking.status IN (:...busyStatuses)',
              {
                busyStatuses: [
                  BOOKING_STATUS.ACCEPTED,
                  BOOKING_STATUS.ENROUTE,
                  BOOKING_STATUS.ARRIVED,
                  BOOKING_STATUS.ONGOING,
                ],
              },
            )
            .andWhere(
              'booking.scheduledAt BETWEEN :conflictStart AND :conflictEnd',
              {
                conflictStart,
                conflictEnd,
              },
            )
            .getRawMany<{
              purohitId: string;
            }>();

        const busyPurohitIds = new Set(
          busyPurohits.map(
            ({ purohitId }) =>
              Number(purohitId),
          ),
        );

        availablePurohitIds =
          matchingPurohitIds.filter(
            (purohitId) =>
              !busyPurohitIds.has(
                purohitId,
              ),
          );
      }

      /*
      * Automatically distribute only when eligible Purohits
      * are available. Otherwise, mark for manual assignment.
      */
      const assignmentType = availablePurohitIds.length > 0 ? ASSIGNMENT_TYPE.AUTO : ASSIGNMENT_TYPE.MANUAL;

      /*
      * Current pricing uses the service minimum price.
      */
      const agreedPrice = minPrice;
      const discountAmount = 0;

      const platformCommission = Number((agreedPrice * (commissionPercentage / 100)).toFixed(2));

      /*
      * Current business assumption:
      * Donation is included in the customer's final payment,
      * but not included in the Purohit payout.
      *
      * Change this when the donation ownership rule is confirmed.
      */
      const purohitPayoutAmount = Number((agreedPrice - platformCommission).toFixed(2));

      const finalAmount = Number((agreedPrice - discountAmount + donationAmount).toFixed(2));

      if (platformCommission < 0 || purohitPayoutAmount < 0 || finalAmount < 0) {
        throw new BadRequestException('Calculated booking amount is invalid');
      }

      /*
      * Generate a unique booking number inside the transaction.
      */
      const bookingNumber = await this.generateUniqueBookingNumber(bookingRepository);

      const booking = bookingRepository.create({
          bookingNumber,
          customerId: customer.id,
          serviceId: service.id,
          customerAddressId:
          customerAddress.id,
          addressSnapshot:this.createAddressSnapshot(customerAddress),
          customerPincode,
          scheduledAt,
          specialInstructions: dto.specialInstructions?.trim() || undefined,
          customFields: dto.customFields ?? undefined,
          agreedPrice,
          commissionPercentage,
          platformCommission,
          purohitPayoutAmount,

          /*
          * Coupon is undefined until a proper coupon-validation
          * flow is implemented.
          */
          couponCode: undefined,
          discountAmount,
          donationAmount,
          finalAmount,
          status: BOOKING_STATUS.PENDING,
          paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
          assignmentType, 
          filteredPurohitIds: availablePurohitIds,
        });

      return bookingRepository.save(
        booking,
      );
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

  private async generateUniqueBookingNumber(
    bookingRepository: Repository<Booking>,
  ): Promise<string> {
    const maximumAttempts = 5;

    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      const timestamp = Date.now()
        .toString()
        .slice(-8);

      const randomPart = Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();

      const bookingNumber =
        `PW${timestamp}${randomPart}`;

      const alreadyExists =
        await bookingRepository.exists({
          where: {
            bookingNumber,
          },
        });

      if (!alreadyExists) {
        return bookingNumber;
      }
    }

    throw new ConflictException(
      'Unable to generate a unique booking number. Please try again.',
    );
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
    const booking = await this.bookingRepository.findBookingById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
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
      case BOOKING_STATUS.COMPLETED: booking.completionConfirmedAt = new Date();
        break;

      default:
        break;
    }

    const updatedBooking = await this.bookingRepository.saveBooking(booking);

    return {
      message: 'Booking status updated successfully',
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