import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException, InternalServerErrorException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { randomInt } from 'crypto';
import * as path from 'path';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, Repository, QueryFailedError  } from 'typeorm';
import { ASSIGNMENT_TYPE, Booking, BOOKING_PAYMENT_STATUS, BOOKING_STATUS, CustomerAddress, Service, USER_ROLE, User , CANCELLED_BY, PurohitProfile, USER_STATUS, PUROHIT_VERIFICATION_STATUS, PurohitService, PurohitServiceArea } from '@likemyproduct/entities';
import { BookingRepository } from '@likemyproduct/repositories';
import { BookingQueryDto, CreateBookingDto, UpdateBookingDto, CancelBookingDto, RespondBookingDto, PUROHIT_BOOKING_ACTION, AssignBookingDto, UpdateBookingStatusDto, VerifyCompletionOtpDto } from '@likemyproduct/dtos';
import { S3Service } from '@likemyproduct/s3';
import { SmsService } from '@likemyproduct/sms-services';
import { EmailService } from '@likemyproduct/email-services';

@Injectable()
export class BookingService {
    private readonly logger = new Logger(BookingService.name);
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    ) {}

    @Cron('0 * * * * *', {
    name: 'change-auto-bookings-to-manual',
  })

  async changeAutoBookingsToManualCron():
    Promise<void> {
    this.logger.log('AUTO to MANUAL booking cron started');

    try {
      const affectedBookings = await this.changeBookingsToManual();
      this.logger.log(`AUTO to MANUAL cron completed. Updated bookings: ${affectedBookings}`);
    } catch (error) {
      this.logger.error('Failed to change AUTO bookings to MANUAL',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async changeBookingsToManual(): Promise<number> {
    const bookingRepository =
      this.dataSource.getRepository(Booking);

    const result = await bookingRepository
      .createQueryBuilder()
      .update(Booking)
      .set({
        assignmentType: ASSIGNMENT_TYPE.MANUAL,
      })
      .where(
        '"status" = :status',
        {
          status: BOOKING_STATUS.PENDING,
        },
      )
      .andWhere(
        '"assignmentType" = :assignmentType',
        {
          assignmentType: ASSIGNMENT_TYPE.AUTO,
        },
      )
      .andWhere('"purohitId" IS NULL')
      .andWhere(
        `"createdAt" <=
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        - INTERVAL '5 minutes'`,
      )
      .execute();

    return result.affected ?? 0;
  }

  async createBooking(
    user: User,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can create bookings');
    }

    /*
    * Fixed booking configuration.
    * No .env variables are required.
    */
    const minimumLeadTimeMinutes = 120;
    const maximumAdvanceDays = 180;
    const conflictWindowMinutes = 120;
    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    const minimumScheduledAt = new Date(Date.now() + minimumLeadTimeMinutes * 60 * 1000);

    if (scheduledAt < minimumScheduledAt) {
      throw new BadRequestException(`Booking must be scheduled at least ${minimumLeadTimeMinutes} minutes in advance`);
    }

    const maximumScheduledAt = new Date(
      Date.now() + maximumAdvanceDays * 24 * 60 * 60 * 1000,
    );

    if (scheduledAt > maximumScheduledAt) {
      throw new BadRequestException(`Booking cannot be scheduled more than ${maximumAdvanceDays} days in advance`);
    }

    try {
      return await this.dataSource.transaction(
        async (manager) => {
          const userRepository = manager.getRepository(User);
          const serviceRepository = manager.getRepository(Service);
          const addressRepository = manager.getRepository(CustomerAddress);
          const bookingRepository = manager.getRepository(Booking);
          const purohitProfileRepository = manager.getRepository(PurohitProfile);

          /*
          * Reload customer from database so an old JWT
          * cannot be used by an inactive or blocked user.
          */
          const customer =
            await userRepository.findOne({
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
          const service =
            await serviceRepository.findOne({
              where: {
                id: dto.serviceId,
              },
            });

          if (!service) {
            throw new NotFoundException('Service not found');
          }

          if (!service.isActive) {
            throw new BadRequestException('Service is currently inactive' );
          }

          /*
          * Address is required for an offline booking.
          */
          if (!dto.customerAddressId) {
            throw new BadRequestException('Customer address is required for booking');
          }

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
          * Validate customer coordinates.
          */
          const customerLatitude = Number(customerAddress.latitude);
          const customerLongitude = Number(customerAddress.longitude);

          if (!Number.isFinite(customerLatitude) || customerLatitude < -90 || customerLatitude > 90) {
            throw new BadRequestException('Selected customer address does not have a valid latitude');
          }

          if (!Number.isFinite(customerLongitude) || customerLongitude < -180 || customerLongitude > 180) {
            throw new BadRequestException('Selected customer address does not have a valid longitude');
          }

          /*
          * Validate pricing configuration.
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

          const donationAmount = Number( dto.donationAmount ?? 0);

          if (!Number.isFinite(donationAmount) || donationAmount < 0) {
            throw new BadRequestException('Donation amount must be zero or greater');
          }

          const couponCode = dto.couponCode?.trim();

          if (couponCode) {
            throw new BadRequestException('Coupon functionality is not currently available');
          }

          /*
          * Transaction-level advisory lock.
          *
          * Simultaneous requests for the same customer,
          * service and scheduled time will be processed
          * one after another.
          */
          const duplicateLockKey = [
            customer.id,
            service.id,
            scheduledAt.toISOString(),
          ].join(':');

          await manager.query(
            `
              SELECT pg_advisory_xact_lock(
                hashtext($1)
              )
            `,
            [duplicateLockKey],
          );

          const activeBookingStatuses = [
            BOOKING_STATUS.PENDING,
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.ENROUTE,
            BOOKING_STATUS.ARRIVED,
            BOOKING_STATUS.ONGOING,
          ];

          /*
          * Prevent an active duplicate booking.
          */
          const duplicateBookingExists =
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
                  statuses:
                    activeBookingStatuses,
                },
              )
              .getExists();

          if (duplicateBookingExists) {
            throw new ConflictException('An active booking for this service and scheduled time already exists');
          }

          /*
          * Find approved and active Purohits who:
          *
          * 1. Provide the selected service.
          * 2. Are available for offline bookings.
          * 3. Serve the customer's pincode.
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
                  purohitRole:
                    USER_ROLE.PUROHIT,
                },
              )
              .andWhere(
                'purohit_user.status = :purohitUserStatus',
                {
                  purohitUserStatus:
                    USER_STATUS.ACTIVE,
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
          * Remove Purohits who already have another
          * active booking within the conflict window.
          */
          let availablePurohitIds = matchingPurohitIds;

          if (matchingPurohitIds.length > 0) {
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
                  `
                    booking.scheduledAt
                    BETWEEN :conflictStart
                    AND :conflictEnd
                  `,
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
          * Current pricing uses the minimum
          * service price.
          */
          const agreedPrice = minPrice;
          const discountAmount = 0;
          const platformCommission = Number((agreedPrice * (commissionPercentage / 100)).toFixed(2));
          const purohitPayoutAmount = Number((agreedPrice - platformCommission).toFixed(2));
          const finalAmount = Number((agreedPrice - discountAmount + donationAmount).toFixed(2));

          if (platformCommission < 0 || purohitPayoutAmount < 0 || finalAmount < 0) {
            throw new BadRequestException('Calculated booking amount is invalid');
          }

          const bookingNumber = await this.generateUniqueBookingNumber(bookingRepository);
          const booking = bookingRepository.create({bookingNumber,

              customerId: customer.id,
              serviceId: service.id,

              customerAddressId: customerAddress.id,

              addressSnapshot:
                this.createAddressSnapshot(customerAddress),

              customerPincode,
              scheduledAt,

              specialInstructions: dto.specialInstructions?.trim() || undefined,

              customFields: dto.customFields ?? undefined,

              agreedPrice,
              commissionPercentage,
              platformCommission,
              purohitPayoutAmount,

              couponCode: undefined,
              discountAmount,
              donationAmount,
              finalAmount,

              status:
                BOOKING_STATUS.PENDING,

              paymentStatus:
                BOOKING_PAYMENT_STATUS.PENDING,

              /*
              * Every new booking starts in AUTO mode.
              *
              * The cron job will later change it to
              * MANUAL if no Purohit accepts it.
              */
              assignmentType:
                ASSIGNMENT_TYPE.AUTO,

              filteredPurohitIds:
                availablePurohitIds,
            });

          return bookingRepository.save(
            booking,
          );
        },
      );
    } catch (error) {
      /*
      * PostgreSQL unique constraint violation.
      *
      * This will work after adding the unique
      * partial index migration.
      */
      if (
        error instanceof QueryFailedError &&
        (
          error as QueryFailedError & {
            driverError?: {
              code?: string;
            };
          }
        ).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          'An active booking for this service and scheduled time already exists',
        );
      }

      throw error;
    }
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

  async softDeleteBooking(
    user: User,
    bookingId: number,
  ): Promise<{
    message: string;
  }> {
    if (user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only admins can delete bookings');
    }

    const booking = await this.bookingRepository.findOne({
        where: {
          id: bookingId,
        },
        withDeleted: true,
      });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.deletedAt) {
      throw new ConflictException('Booking is already deleted');
    }

    const nonDeletableStatuses = [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ENROUTE, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.ONGOING];

    if (nonDeletableStatuses.includes(booking.status)) {
      throw new BadRequestException(`Booking cannot be deleted while its status is ${booking.status}`);
    }
    await this.bookingRepository.softDeleteBooking(booking.id);

    return {
      message: 'Booking deleted successfully',
    };
  }

  async restoreBooking(
    bookingId: number,
  ): Promise<{
    message: string;
  }> {
    const booking = await this.bookingRepository.findBookingByIdIncludingDeleted(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!booking.deletedAt) {
      throw new BadRequestException('Booking is not deleted');
    }

    await this.bookingRepository.restoreBooking(bookingId);

    return {
      message:'Booking restored successfully',
    };
  }

  async cancelBooking(
    user: User,
    bookingId: number,
    dto: CancelBookingDto,
  ): Promise<{
    message: string;
    booking: Booking;
  }> {
    const allowedRoles: USER_ROLE[] = [USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT, USER_ROLE.ADMIN];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('You are not allowed to cancel bookings');
    }

    const cancellationReason = dto.cancellationReason?.trim();

    return this.dataSource.transaction(
      async (manager) => {
        const bookingRepository = manager.getRepository(Booking);

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
          throw new NotFoundException('Booking not found');
        }

        if (booking.status === BOOKING_STATUS.CANCELLED) {
          throw new ConflictException('Booking is already cancelled');
        }

        if ( booking.status === BOOKING_STATUS.COMPLETED) {
          throw new BadRequestException('Completed bookings cannot be cancelled');
        }

        let cancelledBy: CANCELLED_BY;
        let message = 'Booking cancelled successfully';

        switch (user.role) {
          case USER_ROLE.CUSTOMER:
            this.validateCustomerCancellation(
              user,
              booking,
            );

            cancelledBy = CANCELLED_BY.CUSTOMER;
            booking.status = BOOKING_STATUS.CANCELLED;

            break;

          case USER_ROLE.PUROHIT:
            await this.validatePurohitCancellation(
              manager,
              user,
              booking,
              cancellationReason,
            );

            cancelledBy = CANCELLED_BY.PUROHIT;

            /*
            * Purohit cancellation should release
            * the booking for another Purohit.
            */
            booking.status = BOOKING_STATUS.PENDING;
            booking.purohitId = undefined;
            message = 'Booking released successfully and is available for reassignment';
            break;

          case USER_ROLE.ADMIN:
            this.validateAdminCancellation(
              cancellationReason,
            );

            cancelledBy = CANCELLED_BY.ADMIN;
            booking.status = BOOKING_STATUS.CANCELLED;

            break;

          default:
            throw new ForbiddenException('You are not allowed to cancel this booking');
        }

        booking.cancelledBy = cancelledBy;

        booking.cancellationReason = cancellationReason || undefined;

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
    if (user.role !== USER_ROLE.PUROHIT) {
      throw new ForbiddenException(
        'Only Purohits can respond to bookings',
      );
    }

    return this.dataSource.transaction(
      async (manager) => {
        const bookingRepository =
          manager.getRepository(Booking);

        const purohitProfileRepository =
          manager.getRepository(PurohitProfile);

        const purohitProfile =
          await purohitProfileRepository.findOne({
            where: {
              userId: user.id,
            },
          });

        if (!purohitProfile) {
          throw new NotFoundException(
            'Purohit profile not found',
          );
        }

        /*
        * Lock only the booking table row.
        *
        * Do not add LEFT JOIN relations to a
        * pessimistic locking query.
        */
        const booking =
          await bookingRepository
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
          booking.status !==
            BOOKING_STATUS.PENDING ||
          booking.purohitId !== null &&
            booking.purohitId !== undefined
        ) {
          throw new ConflictException(
            'This booking is no longer available',
          );
        }

        const filteredPurohitIds =
          booking.filteredPurohitIds ?? [];

        if (
          !filteredPurohitIds.includes(
            purohitProfile.id,
          )
        ) {
          throw new ForbiddenException(
            'This booking is not available to you or has already been dismissed',
          );
        }

        switch (dto.action) {
          case PUROHIT_BOOKING_ACTION.ACCEPT: {
            booking.purohitId =
              purohitProfile.id;

            booking.status =
              BOOKING_STATUS.ACCEPTED;

            /*
            * Booking should disappear from the
            * available list of all Purohits.
            */
            booking.filteredPurohitIds = [];

            const savedBooking =
              await bookingRepository.save(
                booking,
              );

            /*
            * Reload the booking with relations
            * after saving. No lock is needed here.
            */
            const acceptedBooking =
              await bookingRepository.findOne({
                where: {
                  id: savedBooking.id,
                },
                relations: {
                  customer: true,
                  service: true,
                  customerAddress: true,
                  purohit: {
                    user: true,
                  },
                },
              });

            return {
              message:
                'Booking accepted successfully',
              booking:
                acceptedBooking ??
                savedBooking,
            };
          }

          case PUROHIT_BOOKING_ACTION.DISMISS: {
            booking.filteredPurohitIds =
              filteredPurohitIds.filter(
                (purohitId) =>
                  purohitId !==
                  purohitProfile.id,
              );

            await bookingRepository.save(
              booking,
            );

            return {
              message:
                'Booking dismissed successfully',
            };
          }

          default:
            throw new BadRequestException(
              'Invalid booking response action',
            );
        }
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
      // [BOOKING_STATUS.ONGOING]: [BOOKING_STATUS.COMPLETED],
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

  async uploadCompletionProof(
    user: User,
    bookingId: number,
    files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one completion proof image is required');
    }

    const booking =
      await this.bookingRepository.findBookingById(
        bookingId,
      );

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BOOKING_STATUS.ONGOING) {
      throw new BadRequestException('Completion proof can only be uploaded for an ongoing booking');
    }

    await this.validateCompletionProofAccess(
      user,
      booking,
    );

    const uploadedFiles: Array<{
      key: string;
      url: string;
    }> = [];

    try {
      for (const file of files) {
        const extension =
          this.getCompletionProofExtension(
            file.originalname,
          );

        const key =
          `bookings/${booking.id}/completion-proofs/` +
          `${Date.now()}-${crypto.randomUUID()}${extension}`;

        const url =
          await this.s3Service.uploadFile(
            key,
            file.buffer,
            file.mimetype,
          );

        uploadedFiles.push({
          key,
          url,
        });
      }

      const existingPhotoUrls = booking.completionPhotoUrls ?? [];

      booking.completionPhotoUrls = [
        ...existingPhotoUrls,
        ...uploadedFiles.map(
          (uploadedFile) => uploadedFile.url,
        ),
      ];

      const savedBooking =
        await this.bookingRepository.save(
          booking,
        );

      return {
        message: 'Completion proof uploaded successfully',
        bookingId: savedBooking.id,
        bookingNumber: savedBooking.bookingNumber,
        completionPhotoUrls: savedBooking.completionPhotoUrls,
      };
    } catch (error) {
      await Promise.allSettled(
        uploadedFiles.map((uploadedFile) =>
          this.s3Service.deleteFile(
            uploadedFile.key,
          ),
        ),
      );

      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to upload completion proof',
      );
    }
  }

  private async validateCompletionProofAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    if (user.role === USER_ROLE.ADMIN) {
      return;
    }

    if (user.role !== USER_ROLE.PUROHIT) {
      throw new ForbiddenException('Only the assigned Purohit can upload completion proof');
    }

    const purohitProfileRepository = this.dataSource.getRepository(PurohitProfile);

    const purohitProfile =
      await purohitProfileRepository.findOne({
        where: {
          userId: user.id,
        },
      });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (booking.purohitId !== purohitProfile.id) {
      throw new ForbiddenException('You are not assigned to this booking');
    }
  }

  private getCompletionProofExtension(
    originalName: string,
  ): string {
    const extension =
      path.extname(originalName).toLowerCase();

    const allowedExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
    ];

    if (
      !allowedExtensions.includes(extension)
    ) {
      throw new BadRequestException(
        'Unsupported image extension',
      );
    }

    return extension;
  }

  async generateCompletionOtp(
    user: User,
    bookingId: number,
  ) {
    const booking =
      await this.bookingRepository.findBookingById(
        bookingId,
      );

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    await this.validateCompletionOtpGenerationAccess(
      user,
      booking,
    );

    if (
      booking.status !== BOOKING_STATUS.ONGOING) {
      throw new BadRequestException( 'Completion OTP can only be generated for an ongoing booking',
      );
    }

    if (booking.completionConfirmedAt) {
      throw new BadRequestException('Booking completion has already been confirmed');
    }

    if (!booking.customer) {
      throw new NotFoundException('Booking customer details not found');
    }

    const customerPhone = booking.customer.phone;
    const customerEmail = booking.customer.email;

    if (!customerPhone && !customerEmail) {
      throw new BadRequestException('Customer does not have a phone number or email address');
    }

    const otp = randomInt(
      100000,
      1000000,
    ).toString();

    booking.completionOtp = otp;

    await this.bookingRepository.saveBooking(
      booking,
    );

    const deliveryResults =
      await Promise.allSettled([
        customerPhone
          ? this.smsService.sendSms(
              customerPhone,
              `Your Poojawala booking completion OTP is ${otp}. Share this OTP only after the Puja service is completed.`,
            )
          : Promise.resolve(null),

        customerEmail
          ? this.emailService.sendOtpEmail(
              customerEmail,
              otp,
              booking.customer.firstName,
            )
          : Promise.resolve(null),
      ]);

    const smsResult = deliveryResults[0];
    const emailResult = deliveryResults[1];
    const smsSent = Boolean(customerPhone) && smsResult.status === 'fulfilled';
    const emailSent = Boolean(customerEmail) && emailResult.status === 'fulfilled';

    if (!smsSent && !emailSent) {
      booking.completionOtp = undefined;

      await this.bookingRepository.saveBooking(
        booking,
      );

      throw new InternalServerErrorException('Unable to send completion OTP. Please try again');
    }

    return {
      message:
        'Booking completion OTP sent successfully',

      bookingId:
        booking.id,

      bookingNumber:
        booking.bookingNumber,

      sentVia: {
        sms: smsSent,
        email: emailSent,
      },

      // Use only during development/Postman testing.
      ...(process.env['NODE_ENV'] !==
        'production'
        ? { otp }
        : {}),
    };
  }

  private async validateCompletionOtpGenerationAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    switch (user.role) {
      case USER_ROLE.ADMIN:
        return;

      case USER_ROLE.PUROHIT:
        await this.validateAssignedPurohit(
          user.id,
          booking,
        );
        return;

      default:
        throw new ForbiddenException('Only the assigned Purohit or an admin can generate the completion OTP');
    }
  }

  async verifyCompletionOtp(
    user: User,
    bookingId: number,
    dto: VerifyCompletionOtpDto,
  ) {
    const booking =
      await this.bookingRepository.findBookingById(
        bookingId,
      );

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.customerId !== user.id) {
      throw new ForbiddenException('Only the booking customer can verify this completion OTP');
    }

    if (booking.status !== BOOKING_STATUS.ONGOING) {
      throw new BadRequestException('Completion OTP can only be verified for an ongoing booking');
    }

    if (!booking.completionOtp) {
      throw new BadRequestException('Completion OTP has not been generated');
    }

    if (booking.completionOtp !== dto.otp) {
      throw new BadRequestException('Invalid completion OTP');
    }

    booking.status = BOOKING_STATUS.COMPLETED;
 
    booking.completionConfirmedAt = new Date();

    const updatedBooking =
      await this.bookingRepository.saveBooking(
        booking,
      );

    return {
      message:
        'Completion OTP verified and booking completed successfully',

      booking: {
        id:
          updatedBooking.id,

        bookingNumber:
          updatedBooking.bookingNumber,

        status:
          updatedBooking.status,

        completionConfirmedAt:
          updatedBooking
            .completionConfirmedAt,
      },
    };
  }
}