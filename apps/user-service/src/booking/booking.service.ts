import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  Optional,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { randomInt } from 'crypto';
import * as path from 'path';
import { Cron } from '@nestjs/schedule';
import {
  DataSource,
  EntityManager,
  Repository,
  QueryFailedError,
} from 'typeorm';
import {
  ASSIGNMENT_TYPE,
  Booking,
  BOOKING_MODE,
  BOOKING_PAYMENT_STATUS,
  BOOKING_PAYMENT_TYPE,
  BOOKING_STATUS,
  CANCELLED_BY,
  Coupon,
  CouponUsage,
  CustomerAddress,
  DISCOUNT_TYPE,
  PUROHIT_VERIFICATION_STATUS,
  PurohitProfile,
  PurohitService,
  PurohitServiceArea,
  Service,
  SERVICE_PLAN,
  User,
  USER_ROLE,
  USER_STATUS,
  NOTIFICATION_TYPE,
  PAYMENT_TYPE,
  CUSTOMER_PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '@poojawala/entities';
import { BookingRepository } from '@poojawala/repositories';
import {
  AssignBookingDto,
  BookingQueryDto,
  CancelBookingDto,
  CreateBookingByAdminDto,
  CreateBookingDto,
  PUROHIT_BOOKING_ACTION,
  RespondBookingDto,
  UpdateBookingDto,
  UpdateBookingStatusDto,
  VerifyStartOtpDto,
  RepeatBookingDto,
  RescheduleBookingDto,
} from '@poojawala/dtos';
import { S3Service } from '@poojawala/s3';
import { SmsService } from '@poojawala/sms-services';
import { EmailService } from '@poojawala/email-services';
import { AssignmentService } from '../assignment/assignment.service';
import { BookingGateway } from '@poojawala/gateway';
import { NotificationService } from '@poojawala/notification';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import { AuditLogService, normalizeCityName } from '@poojawala/common';
import { PaymentService } from '../../../payment-service/src/payment/payment.service';

export interface CreateBookingResponse {
  bookingId: number;
  bookingNumber: string;
  status: BOOKING_STATUS;
  paymentType: BOOKING_PAYMENT_TYPE;
  paymentStatus: BOOKING_PAYMENT_STATUS;
  paymentId: number | string | null;
  paymentUrl: string | null;
}

export interface CreateBookingByAdminResponse {
  bookingId: number;
  bookingNumber: string;
  plan: SERVICE_PLAN | string | null;
  status: BOOKING_STATUS;
  paymentType: BOOKING_PAYMENT_TYPE;
  paymentStatus: BOOKING_PAYMENT_STATUS;
  paymentId: null;
  paymentUrl: null;
  purohitId?: number | null;
}

interface CouponCalculationResult {
  coupon: Coupon;
  discountAmount: number;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly assignmentService: AssignmentService,
    private readonly bookingGateway: BookingGateway,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly paymentService?: PaymentService,
  ) { }

  private getIstDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);

    const weekday = parts.find((p) => p.type === 'weekday')?.value;

    const hour = Number(parts.find((p) => p.type === 'hour')?.value);

    return {
      weekday,
      hour,
    };
  }

  private toIstString(date?: Date | string | null) {
    if (!date) {
      return null;
    }

    return new Date(date).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  @Cron('0 * * * * *', {
    name: 'mark-expired-bookings-manual',
  })
  async markExpiredBookingsManual(): Promise<void> {
    this.logger.log('Checking expired bookings for manual assignment...');

    try {
      const updatedBookings = await this.bookingRepository.markExpiredAsManual();

      if (updatedBookings.length > 0) {
        this.logger.log(
          `${updatedBookings.length} booking(s) marked for manual assignment`,
        );

        for (const booking of updatedBookings) {
          await this.auditLogService.createAuditLog({
            actorId: null,
            actorType: ACTOR_TYPE.SYSTEM,
            actorRole: undefined,
            module: AUDIT_MODULE.BOOKING,
            entity: 'Booking',
            entityId: String(booking.id),
            action: 'BOOKING_EXPIRED_MANUAL_ASSIGNMENT',
            message: `Booking #${booking.id} auto-assignment time expired and was marked for manual assignment by SYSTEM.`,
            oldValue: { assignmentType: 'AUTO' },
            newValue: { assignmentType: 'MANUAL' },
          });
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to update expired bookings',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async createBooking(
    user: User,
    dto: CreateBookingDto,
  ): Promise<CreateBookingResponse> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can create bookings');
    }

    const minimumLeadTimeMinutes = 120;
    const maximumAdvanceDays = 180;

    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    const minimumScheduledAt = new Date(
      Date.now() + minimumLeadTimeMinutes * 60 * 1000,
    );

    if (scheduledAt < minimumScheduledAt) {
      throw new BadRequestException(
        `Booking must be scheduled at least ${minimumLeadTimeMinutes} minutes in advance`,
      );
    }

    const maximumScheduledAt = new Date(
      Date.now() + maximumAdvanceDays * 24 * 60 * 60 * 1000,
    );

    if (scheduledAt > maximumScheduledAt) {
      throw new BadRequestException(
        `Booking cannot be scheduled more than ${maximumAdvanceDays} days in advance`,
      );
    }

    try {
      const transactionResult = await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const serviceRepository = manager.getRepository(Service);
        const addressRepository = manager.getRepository(CustomerAddress);
        const bookingRepository = manager.getRepository(Booking);
        if (!dto.customerAddressId) {
          throw new BadRequestException(
            'Customer address is required for booking',
          );
        }

        const [customer, service, customerAddress] = await Promise.all([
          userRepository.findOne({
            where: {
              id: user.id,
              role: USER_ROLE.CUSTOMER,
              status: USER_STATUS.ACTIVE,
            },
          }),
          serviceRepository.findOne({
            where: {
              id: dto.serviceId,
            },
          }),
          addressRepository.findOne({
            where: {
              id: dto.customerAddressId,
              customerId: user.id,
            },
          }),
        ]);

        if (!customer) {
          throw new ForbiddenException(
            'Only active customers can create bookings',
          );
        }

        if (!service) {
          throw new NotFoundException('Service not found');
        }

        if (!service.isActive) {
          throw new BadRequestException('Service is currently inactive');
        }

        if (!customerAddress) {
          throw new NotFoundException(
            'Customer address not found or does not belong to you',
          );
        }

        // Validate Service is available in customer address booking city
        const bookingCity = customerAddress.city?.trim();
        if (!bookingCity) {
          throw new BadRequestException(
            'Selected customer address does not contain a valid city',
          );
        }

        const serviceCities = Array.isArray(service.cities) ? service.cities : [];
        const normalizedBookingCity = normalizeCityName(bookingCity);
        const isCityAvailable = serviceCities.some(
          (c) => normalizeCityName(c.name) === normalizedBookingCity,
        );

        if (!isCityAvailable) {
          throw new BadRequestException(
            'Selected service is not available in the booking city.',
          );
        }

        const customerPincode = customerAddress.pincode?.trim();

        if (!customerPincode) {
          throw new BadRequestException(
            'A valid pincode is required in the selected customer address',
          );
        }

        /*
         * Coordinates are now especially
         * important because AssignmentService
         * uses Haversine distance.
         */
        const customerLatitude = Number(customerAddress.latitude);
        const customerLongitude = Number(customerAddress.longitude);

        if (
          !Number.isFinite(customerLatitude) ||
          customerLatitude < -90 ||
          customerLatitude > 90
        ) {
          throw new BadRequestException(
            'Selected customer address does not have a valid latitude',
          );
        }

        if (
          !Number.isFinite(customerLongitude) ||
          customerLongitude < -180 ||
          customerLongitude > 180
        ) {
          throw new BadRequestException(
            'Selected customer address does not have a valid longitude',
          );
        }

        /*
         * Pricing validation and resolution based on Basic / Standard plans.
         * The backend resolves the price directly from service.plans[plan].price.
         * Never trust price or amount from frontend.
         */
        let bookingPrice: number;
        let selectedPlan: SERVICE_PLAN;

        if (!service.plans) {
          throw new BadRequestException('Service plans are not configured for this service');
        }

        const rawPlan = dto.plan as string | undefined;
        if (
          !rawPlan ||
          (rawPlan.toUpperCase() !== 'BASIC' && rawPlan.toUpperCase() !== 'STANDARD')
        ) {
          throw new BadRequestException('A valid plan (BASIC or STANDARD) must be selected');
        }

        const normalizedKey = rawPlan.toUpperCase() === 'STANDARD' ? 'standard' : 'basic';
        const planObj =
          (service.plans as any)[normalizedKey] ||
          (service.plans as any)[rawPlan] ||
          (service.plans as any)[rawPlan.toLowerCase()] ||
          (service.plans as any)[rawPlan.toUpperCase()];

        if (!planObj || !Number.isFinite(Number(planObj.price)) || Number(planObj.price) <= 0) {
          throw new BadRequestException(`Price is not configured for the selected ${rawPlan} plan`);
        }
        bookingPrice = Number(planObj.price);
        selectedPlan = rawPlan.toUpperCase() === 'STANDARD' ? SERVICE_PLAN.STANDARD : SERVICE_PLAN.BASIC;

        // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
        /*
        const samagriIncluded = typeof dto.samagriIncluded === 'boolean'
          ? dto.samagriIncluded
          : false;
        if (samagriIncluded) {
          const priceWithSamagri =
            service.priceWithSamagri != null
              ? Number(service.priceWithSamagri)
              : NaN;
          if (!Number.isFinite(priceWithSamagri) || priceWithSamagri <= 0) {
            throw new BadRequestException(
              'Samagri-inclusive pricing is not configured for this service',
            );
          }
          bookingPrice = priceWithSamagri;
        } else {
          const priceWithoutSamagri =
            service.priceWithoutSamagri != null
              ? Number(service.priceWithoutSamagri)
              : NaN;
          if (!Number.isFinite(priceWithoutSamagri) || priceWithoutSamagri <= 0) {
            throw new BadRequestException(
              'Pricing without samagri is not configured for this service',
            );
          }
          bookingPrice = priceWithoutSamagri;
        }
        */

        // TODO: Legacy minPrice/maxPrice pricing logic.
        // Retained for backward compatibility/reference with historical services.
        const minPrice = service.minPrice != null ? Number(service.minPrice) : null;
        const maxPrice = service.maxPrice != null ? Number(service.maxPrice) : null;

        const commissionPercentage = Number(service.commissionPercentage);

        if (
          !Number.isFinite(commissionPercentage) ||
          commissionPercentage < 0 ||
          commissionPercentage > 100
        ) {
          throw new BadRequestException(
            'A valid commission percentage is not configured for this service',
          );
        }

        const donationAmount = Number(dto.donationAmount ?? 0);

        if (!Number.isFinite(donationAmount) || donationAmount < 0) {
          throw new BadRequestException(
            'Donation amount must be zero or greater',
          );
        }

        const couponCode = dto.couponCode?.trim().toUpperCase();

        /*
         * Prevent concurrent duplicate
         * bookings.
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

        const duplicateBookingExists = await bookingRepository
          .createQueryBuilder('booking')
          .where('booking.customerId = :customerId', {
            customerId: customer.id,
          })
          .andWhere('booking.serviceId = :serviceId', {
            serviceId: service.id,
          })
          .andWhere('booking.scheduledAt = :scheduledAt', {
            scheduledAt,
          })
          .andWhere('booking.status IN (:...statuses)', {
            statuses: activeBookingStatuses,
          })
          .getExists();

        if (duplicateBookingExists) {
          throw new ConflictException(
            'An active booking for this service and scheduled time already exists',
          );
        }

        let appliedCoupon: Coupon | null = null;
        let discountAmount = 0;

        if (couponCode) {
          const couponResult = await this.validateAndCalculateCoupon(
            manager,
            customer.id,
            service.id,
            couponCode,
            bookingPrice, // Use resolved fixed service price
          );

          appliedCoupon = couponResult.coupon;
          discountAmount = couponResult.discountAmount;
        }

        // Purohit payout and commission are calculated using base plan (basic)
        const purohitBasePrice =
          service.plans?.basic?.price != null && Number(service.plans.basic.price) > 0
            ? Number(service.plans.basic.price)
            : bookingPrice;

        const platformCommission = Number(
          (purohitBasePrice * (commissionPercentage / 100)).toFixed(2),
        );
        const purohitPayoutAmount = Number(
          (purohitBasePrice - platformCommission).toFixed(2),
        );
        const finalAmount = Number(
          (bookingPrice - discountAmount + donationAmount).toFixed(2),
        );

        // Effective Token Percentage: defaults to 30 if null or not set on service
        const effectiveTokenPercentage =
          service.tokenPercentage != null && Number(service.tokenPercentage) > 0
            ? Number(service.tokenPercentage)
            : 30;

        const tokenAmount = Number(
          ((finalAmount * effectiveTokenPercentage) / 100).toFixed(2),
        );
        const paidAmount = 0.0;
        const remainingAmount = finalAmount;

        const bookingNumber =
          await this.generateUniqueBookingNumber(bookingRepository);

        const booking = bookingRepository.create({
          bookingNumber,
          customerId: customer.id,
          serviceId: service.id,
          customerAddressId: customerAddress.id,
          addressSnapshot: this.createAddressSnapshot(customerAddress),
          customerPincode,
          bookingMode: dto.bookingMode as BOOKING_MODE,
          scheduledAt,
          specialInstructions: dto.specialInstructions?.trim() || undefined,
          customFields: dto.customFields ?? undefined,
          commissionPercentage,
          plan: selectedPlan,
          // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
          // samagriIncluded: dto.samagriIncluded ?? false,
          servicePrice: bookingPrice,
          platformCommission,
          purohitPayoutAmount,
          couponCode: appliedCoupon?.code ?? undefined,
          discountAmount,
          donationAmount,
          finalAmount,
          tokenPercentage: effectiveTokenPercentage,
          tokenAmount,
          paidAmount,
          remainingAmount,
          status: BOOKING_STATUS.PENDING,
          paymentType: BOOKING_PAYMENT_TYPE.TOKEN,
          paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
          assignmentType: ASSIGNMENT_TYPE.AUTO,
        });

        // TODO: Previous immediate assignment logic on booking creation before token payment gate:
        // /*
        //  * AssignmentService handles:
        //  * - approved Purohits
        //  * - active Purohit users
        //  * - service matching
        //  * - location coordinates
        //  * - Haversine radius
        //  * - busy booking filtering
        //  */
        // const eligiblePurohitIds = await this.assignmentService.findEligiblePurohitIds(
        //   manager,
        //   booking,
        // );
        //
        // booking.filteredPurohitIds = eligiblePurohitIds;
        //
        // const savedBooking = await bookingRepository.save(booking);
        //
        // let eligiblePurohitUserIds: number[] = [];
        // if (eligiblePurohitIds.length > 0) {
        //   const purohitProfiles = await manager
        //     .getRepository(PurohitProfile)
        //     .createQueryBuilder('profile')
        //     .select(['profile.id', 'profile.userId'])
        //     .where('profile.id IN (:...purohitProfileIds)', {
        //       purohitProfileIds: eligiblePurohitIds,
        //     })
        //     .getMany();
        //
        //   eligiblePurohitUserIds = purohitProfiles.map(
        //     (profile) => profile.userId,
        //   );
        // }
        //
        // this.logger.log(
        //   `Booking ${savedBooking.id} created with ${eligiblePurohitIds.length} eligible Purohits`,
        // );

        // TOKEN PAYMENT GATE:
        // Do NOT mark an unpaid booking as assignment-ready.
        // Initially, the booking is created with paymentStatus = PENDING and no Purohits filtered/assigned.
        // Purohit assignment begins only once token payment is confirmed.
        booking.filteredPurohitIds = [];

        const savedBooking = await bookingRepository.save(booking);

        const eligiblePurohitUserIds: number[] = [];

        this.logger.log(
          `Booking ${savedBooking.id} created. Awaiting token payment before Purohit assignment.`,
        );

        /*
         * Save coupon usage.
         */
        if (appliedCoupon) {
          const couponUsageRepository = manager.getRepository(CouponUsage);

          const couponUsage = couponUsageRepository.create({
            coupon: appliedCoupon,
            customer,
            booking: savedBooking,
            discountApplied: discountAmount,
          });

          await couponUsageRepository.save(couponUsage);
        }

        await this.auditLogService.createAuditLog(
          {
            actorId: user.id,
            actorType: ACTOR_TYPE.USER,
            actorRole: user.role,
            module: AUDIT_MODULE.BOOKING,
            entity: 'Booking',
            entityId: String(savedBooking.id),
            action: 'BOOKING_CREATED',
            message: `Customer created Booking B-${savedBooking.id}.`,
            oldValue: undefined,
            newValue: {
              status: savedBooking.status,
              paymentStatus: savedBooking.paymentStatus,
              serviceId: savedBooking.serviceId,
              scheduledAt: savedBooking.scheduledAt,
            },
          },
          manager, // Pass transaction manager
        );

        return { savedBooking, eligiblePurohitUserIds, service };
      });

      for (const purohitUserId of transactionResult.eligiblePurohitUserIds) {
        // Emit legacy event
        // TODO: commented out to avoid duplicate notification
        // this.bookingGateway.notifyUser(
        //           purohitUserId,
        //           'create_booking',
        //           transactionResult.savedBooking,
        //         );

        // Save persistent notification
        await this.notificationService.createNotification(
          purohitUserId,
          'New Booking',
          `You have received a new booking request (Booking B-${transactionResult.savedBooking.id}).`,
          NOTIFICATION_TYPE.BOOKING,
          transactionResult.savedBooking.id,
          'BOOKING',
        );
      }

      // Notify Admins about the new booking
      if (this.notificationService) {
        try {
          const customerName =
            [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            user.phone ||
            'Customer';
          const serviceName =
            transactionResult.service?.name || 'Pooja Service';
          const scheduledDateStr = transactionResult.savedBooking.scheduledAt
            ? new Date(
              transactionResult.savedBooking.scheduledAt,
            ).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
            })
            : 'Scheduled Date';
          const bookingDisplayId =
            transactionResult.savedBooking.bookingNumber ||
            `B-${transactionResult.savedBooking.id}`;

          const planPart = transactionResult.savedBooking.plan
            ? ` - ${transactionResult.savedBooking.plan} plan`
            : '';
          // TODO: SERVICE_MESSAGE_IMPROVEMENT
          // Old message retained for reference; replaced with plan-aware message.
          // `New booking ${bookingDisplayId} for ${serviceName} created by ${customerName}. Scheduled at: ${scheduledDateStr}. Total: ₹${transactionResult.savedBooking.finalAmount}.`
          const adminBookingMessage = `New booking ${bookingDisplayId} for service '${serviceName}'${planPart} created by ${customerName}. Scheduled at: ${scheduledDateStr}. Total: ₹${transactionResult.savedBooking.finalAmount}.`;

          await this.notificationService.notifyAdmins(
            'New Booking Request',
            adminBookingMessage,
            NOTIFICATION_TYPE.BOOKING,
            transactionResult.savedBooking.id,
            'BOOKING',
            {
              bookingId: transactionResult.savedBooking.id,
              bookingNumber: transactionResult.savedBooking.bookingNumber,
              customerId: user.id,
              customerName,
              serviceName,
              servicePlan: transactionResult.savedBooking.plan,
              finalAmount: transactionResult.savedBooking.finalAmount,
              status: transactionResult.savedBooking.status,
              scheduledAt: transactionResult.savedBooking.scheduledAt,
            },
          );
        } catch (err: any) {
          this.logger.warn(
            `Failed to notify admins for new booking: ${err?.message}`,
          );
        }
      }

      // TODO: Previous implementation returned full booking entity with calculations and payment info:
      /*
      const bookingData = {
        ...transactionResult.savedBooking,
        plan: transactionResult.savedBooking.plan ?? null,
        servicePrice: transactionResult.savedBooking.servicePrice ? Number(transactionResult.savedBooking.servicePrice) : null,
        discountAmount: Number(transactionResult.savedBooking.discountAmount ?? 0),
        donationAmount: Number(transactionResult.savedBooking.donationAmount ?? 0),
        finalAmount: Number(transactionResult.savedBooking.finalAmount ?? 0),
        tokenPercentage: transactionResult.savedBooking.tokenPercentage != null ? Number(transactionResult.savedBooking.tokenPercentage) : null,
        tokenAmount: transactionResult.savedBooking.tokenAmount != null ? Number(transactionResult.savedBooking.tokenAmount) : null,
        paidAmount: Number(transactionResult.savedBooking.paidAmount ?? 0),
        remainingAmount: transactionResult.savedBooking.remainingAmount != null ? Number(transactionResult.savedBooking.remainingAmount) : null,
        paymentStatus: transactionResult.savedBooking.paymentStatus,
        plans: transactionResult.service.plans ?? null,
        // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
        // samagriIncluded: transactionResult.savedBooking.samagriIncluded,
        // priceWithoutSamagri: transactionResult.service.priceWithoutSamagri ? Number(transactionResult.service.priceWithoutSamagri) : null,
        // priceWithSamagri: transactionResult.service.priceWithSamagri ? Number(transactionResult.service.priceWithSamagri) : null,
        minPrice: transactionResult.service.minPrice ? Number(transactionResult.service.minPrice) : null,
        maxPrice: transactionResult.service.maxPrice ? Number(transactionResult.service.maxPrice) : null,
        priceRange: transactionResult.service.minPrice && transactionResult.service.maxPrice
          ? `${Number(transactionResult.service.minPrice)} - ${Number(transactionResult.service.maxPrice)}`
          : null,
      };

      let paymentInfo: any = null;
      if (this.paymentService) {
        try {
          const paymentOption = (dto.paymentOption as any) === 'FULL' ? 'FULL' : 'TOKEN';
          const paymentLinkRes = await this.paymentService.createBookingPaymentLink(user, {
            bookingId: transactionResult.savedBooking.id,
            paymentOption,
          });
          paymentInfo = {
            paymentId: paymentLinkRes.paymentId,
            payableAmount: paymentLinkRes.amount,
            amount: paymentLinkRes.amount,
            amountInPaise: paymentLinkRes.amountInPaise,
            currency: paymentLinkRes.currency,
            paymentUrl: paymentLinkRes.paymentUrl,
            razorpayPaymentLinkId: paymentLinkRes.razorpayPaymentLinkId,
            razorpayOrderId: paymentLinkRes.razorpayOrderId,
            status: paymentLinkRes.status,
          };
        } catch (err: any) {
          this.logger.error(
            `Failed to create payment link for booking ${transactionResult.savedBooking.id}: ${err?.message}`,
            err?.stack,
          );
        }
      }

      return {
        ...bookingData,
        booking: bookingData,
        payment: paymentInfo,
      } as any;
      */

      let paymentLinkRes: any = null;
      if (this.paymentService) {
        try {
          const paymentOption = (dto.paymentOption as any) === 'FULL' ? 'FULL' : 'TOKEN';
          paymentLinkRes = await this.paymentService.createBookingPaymentLink(user, {
            bookingId: transactionResult.savedBooking.id,
            paymentOption,
          });
        } catch (err: any) {
          this.logger.error(
            `Failed to create payment link for booking ${transactionResult.savedBooking.id}: ${err?.message}`,
            err?.stack,
          );
        }
      }

      const existingPaymentId = paymentLinkRes?.paymentId ?? null;
      const existingPaymentUrl = paymentLinkRes?.paymentUrl ?? null;

      const bookingData: CreateBookingResponse = {
        bookingId: transactionResult.savedBooking.id,
        bookingNumber: transactionResult.savedBooking.bookingNumber,
        status: transactionResult.savedBooking.status,
        paymentType: transactionResult.savedBooking.paymentType ?? BOOKING_PAYMENT_TYPE.TOKEN,
        paymentStatus: transactionResult.savedBooking.paymentStatus,
        paymentId: existingPaymentId,
        paymentUrl: existingPaymentUrl,
      };

      return bookingData;
    } catch (error) {
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
    // TODO: Old return type
    // bookings: Booking[];
    bookings: Array<Record<string, any>>;
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
      throw new ForbiddenException('You are not allowed to access bookings');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const status = query.status;
    const search = query.search?.trim();

    let purohitProfileId: number | undefined;

    if (user.role === USER_ROLE.PUROHIT) {
      const purohitProfile = await this.getPurohitProfile(user.id);

      purohitProfileId = purohitProfile.id;
    }

    const { bookings, total } = await this.bookingRepository.findBookingsByRole(
      {
        userId: user.id,
        userRole: user.role,
        purohitProfileId,
        page,
        limit,
        status,
        bookingPaymentStatus: query.bookingPaymentStatus,
        purohitPayoutStatus: query.purohitPayoutStatus,
        search,
      },
    );

    const formattedBookings = bookings.map((booking) => {
      // TODO: Old payments and payout logic in findAllBookings
      // const payments = (booking.payments || []).filter(
      //   (p) =>
      //     p.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
      //     Boolean(p.razorpayPaymentLinkId?.trim()),
      // );
      // const bookingPayment = payments.find(
      //   (p) => p.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT
      // ) || null;
      // const purohitPayout = payments.find(
      //   (p) => p.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT
      // ) || null;
      const payments = (booking.payments || []).filter(
        (p) =>
          (user.role !== USER_ROLE.CUSTOMER ||
            (p.paymentType !== PAYMENT_TYPE.PUROHIT_PAYOUT &&
              p.status !== PAYMENT_STATUS.CREATED)) &&
          (p.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
            Boolean(p.razorpayPaymentLinkId?.trim()) ||
            p.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH),
      );
      const bookingPayment =
        payments.find(
          (p) =>
            p.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT &&
            (user.role !== USER_ROLE.CUSTOMER ||
              p.status !== PAYMENT_STATUS.CREATED),
        ) || null;
      const purohitPayout =
        user.role === USER_ROLE.CUSTOMER
          ? null
          : (payments.find((p) => p.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT) || null);

      return {
        ...booking,
        payments,
        bookingPayment,
        purohitPayout,
        purohitPayoutStatus: user.role === USER_ROLE.CUSTOMER ? null : booking.purohitPayoutStatus,
        purohitPayoutAmount: user.role === USER_ROLE.CUSTOMER ? null : booking.purohitPayoutAmount,
        scheduledAtIst: this.toIstString(booking.scheduledAt),
        createdAtIst: this.toIstString(booking.createdAt),
        updatedAtIst: this.toIstString(booking.updatedAt),
      };
    });

    return {
      bookings: formattedBookings,
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

  private async getPurohitProfile(userId: number): Promise<PurohitProfile> {
    const purohitProfileRepository =
      this.dataSource.getRepository(PurohitProfile);
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

  async getBookingById(user: User, bookingId: number) {
    const booking = await this.bookingRepository.findBookingById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const payments = (booking.payments || []).filter(
      (p) =>
        p.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
        Boolean(p.razorpayPaymentLinkId?.trim()),
    );
    booking.payments = payments;
    const bookingPayment = payments.find(
      (p) => p.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT
    ) || null;
    const purohitPayout = payments.find(
      (p) => p.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT
    ) || null;

    switch (user.role) {
      case USER_ROLE.ADMIN:
        // Admin can access any booking.
        return {
          ...booking,
          bookingPayment,
          purohitPayout,
          scheduledAtIst: this.toIstString(booking.scheduledAt),
          createdAtIst: this.toIstString(booking.createdAt),
          updatedAtIst: this.toIstString(booking.updatedAt),
        };

      case USER_ROLE.CUSTOMER:
        // Customer can access only their own booking.
        if (booking.customerId !== user.id) {
          throw new ForbiddenException(
            'You are not allowed to access this booking',
          );
        }

        // TODO: Old customer return including purohitPayout
        // return {
        //   ...booking,
        //   bookingPayment,
        //   purohitPayout,
        //   scheduledAtIst: this.toIstString(booking.scheduledAt),
        //   createdAtIst: this.toIstString(booking.createdAt),
        //   updatedAtIst: this.toIstString(booking.updatedAt),
        // };
        return {
          ...booking,
          payments: (booking.payments || []).filter(
            (p) =>
              p.paymentType !== PAYMENT_TYPE.PUROHIT_PAYOUT &&
              p.status !== PAYMENT_STATUS.CREATED,
          ),
          bookingPayment:
            bookingPayment &&
              bookingPayment.status !== PAYMENT_STATUS.CREATED
              ? bookingPayment
              : null,
          purohitPayout: null,
          purohitPayoutStatus: null,
          purohitPayoutAmount: null,
          scheduledAtIst: this.toIstString(booking.scheduledAt),
          createdAtIst: this.toIstString(booking.createdAt),
          updatedAtIst: this.toIstString(booking.updatedAt),
        };

      case USER_ROLE.PUROHIT: {
        const purohitProfileRepository =
          this.dataSource.getRepository(PurohitProfile);

        const purohitProfile = await purohitProfileRepository.findOne({
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
          throw new ForbiddenException(
            'You are not allowed to access this booking',
          );
        }

        return {
          ...booking,
          bookingPayment,
          purohitPayout,
          scheduledAtIst: this.toIstString(booking.scheduledAt),
          createdAtIst: this.toIstString(booking.createdAt),
          updatedAtIst: this.toIstString(booking.updatedAt),
        };
      }

      default:
        throw new ForbiddenException(
          'You are not allowed to access this booking',
        );
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

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);

      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', {
          bookingId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.customerId !== user.id) {
        throw new ForbiddenException('You cannot update this booking');
      }

      if (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID) {
        throw new BadRequestException('A paid booking cannot be modified');
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

      /*
       * Track whether assignment needs
       * recalculation.
       */
      let assignmentNeedsRefresh = false;

      if (dto.scheduledAt !== undefined) {
        const scheduledAt = new Date(dto.scheduledAt);

        if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
          throw new BadRequestException(
            'Scheduled date and time must be in the future',
          );
        }

        booking.scheduledAt = scheduledAt;

        assignmentNeedsRefresh = true;
      }

      if (dto.customerAddressId !== undefined) {
        const addressRepository = manager.getRepository(CustomerAddress);
        const customerAddress = await addressRepository.findOne({
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

        const latitude = Number(customerAddress.latitude);

        const longitude = Number(customerAddress.longitude);

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
          throw new BadRequestException(
            'Selected customer address does not have a valid latitude',
          );
        }

        if (
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new BadRequestException(
            'Selected customer address does not have a valid longitude',
          );
        }

        booking.customerAddressId = customerAddress.id;

        booking.addressSnapshot = this.createAddressSnapshot(customerAddress);

        booking.customerPincode = this.getAddressPincode(customerAddress);

        assignmentNeedsRefresh = true;
      }

      if (dto.specialInstructions !== undefined) {
        booking.specialInstructions =
          dto.specialInstructions.trim() || undefined;
      }

      if (dto.customFields !== undefined) {
        booking.customFields = dto.customFields;
      }

      if (dto.couponCode !== undefined) {
        throw new BadRequestException(
          'Coupon cannot be changed after booking creation',
        );
      }

      if (dto.donationAmount !== undefined) {
        const donationAmount = Number(dto.donationAmount);

        if (!Number.isFinite(donationAmount) || donationAmount < 0) {
          throw new BadRequestException(
            'Donation amount must be zero or greater',
          );
        }

        booking.donationAmount = donationAmount;

        if (booking.servicePrice != null) {
          booking.finalAmount = Number(
            (
              Number(booking.servicePrice) -
              Number(booking.discountAmount ?? 0) +
              donationAmount
            ).toFixed(2),
          );
          const effectiveTokenPercentage =
            booking.tokenPercentage != null && Number(booking.tokenPercentage) > 0
              ? Number(booking.tokenPercentage)
              : 30;
          booking.tokenAmount = Number(
            ((booking.finalAmount * effectiveTokenPercentage) / 100).toFixed(2),
          );
          booking.remainingAmount = Number(
            (booking.finalAmount - Number(booking.paidAmount ?? 0)).toFixed(2),
          );
        } else if (booking.purohitPayoutAmount != null && booking.platformCommission != null) {
          // Legacy fallback for historical bookings lacking servicePrice
          booking.finalAmount = Number(
            (
              Number(booking.purohitPayoutAmount) +
              Number(booking.platformCommission) -
              Number(booking.discountAmount ?? 0) +
              donationAmount
            ).toFixed(2),
          );
        }
      }

      /*
       * Save changes first so AssignmentService
       * has the latest booking state.
       */
      let savedBooking = await bookingRepository.save(booking);

      /*
       * Address or scheduled-time change
       * means eligibility must be recalculated.
       */
      if (assignmentNeedsRefresh) {
        const previousPurohitId = savedBooking.purohitId;

        const eligiblePurohitIds =
          await this.assignmentService.findEligiblePurohitIds(
            manager,
            savedBooking,
          );

        if (
          savedBooking.status === BOOKING_STATUS.ACCEPTED &&
          previousPurohitId
        ) {
          if (eligiblePurohitIds.includes(previousPurohitId)) {
            /*
             * Current Purohit still qualifies.
             */
            savedBooking.filteredPurohitIds = [];
          } else {
            /*
             * Existing Purohit no longer
             * qualifies for new time/location.
             */
            savedBooking.purohitId = null as unknown as undefined;

            savedBooking.status = BOOKING_STATUS.PENDING;

            savedBooking.assignmentType = ASSIGNMENT_TYPE.AUTO;

            savedBooking.filteredPurohitIds = eligiblePurohitIds.filter(
              (id) => id !== previousPurohitId,
            );
          }
        } else {
          savedBooking.filteredPurohitIds = eligiblePurohitIds;
        }

        savedBooking = await bookingRepository.save(savedBooking);
      }

      await this.auditLogService.createAuditLog(
        {
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.BOOKING,
          entity: 'Booking',
          entityId: String(savedBooking.id),
          action: 'BOOKING_UPDATED',
          message: `Booking B-${savedBooking.id} details were updated.`,
          oldValue: undefined,
          newValue: {
            scheduledAt: savedBooking.scheduledAt,
            customerAddressId: savedBooking.customerAddressId,
            specialInstructions: savedBooking.specialInstructions,
          },
        },
        manager,
      );

      return savedBooking;
    });
  }

  private validateCustomerCancellation(user: User, booking: Booking): void {
    if (booking.customerId !== user.id) {
      throw new ForbiddenException('You can only cancel your own booking');
    }

    const customerCancellableStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
    ];

    if (!customerCancellableStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Customer cannot cancel a booking when status is ${booking.status}`,
      );
    }
  }

  private async validatePurohitCancellation(
    manager: EntityManager,
    user: User,
    booking: Booking,
    cancellationReason?: string,
  ): Promise<void> {
    if (!cancellationReason?.trim()) {
      throw new BadRequestException(
        'Cancellation reason is required when a Purohit cancels a booking',
      );
    }

    const purohitProfileRepository = manager.getRepository(PurohitProfile);

    const purohitProfile = await purohitProfileRepository.findOne({
      where: {
        userId: user.id,
      },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (!booking.purohitId) {
      throw new ForbiddenException(
        'This booking is not assigned to any Purohit',
      );
    }

    /*
     * booking.purohitId references PurohitProfile.id.
     * user.id references User.id.
     */
    if (booking.purohitId !== purohitProfile.id) {
      throw new ForbiddenException(
        'You can only cancel bookings assigned to you',
      );
    }

    const allowedStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
    ];

    if (!allowedStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Purohit cannot cancel a booking with status ${booking.status}`,
      );
    }
  }

  private validateAdminCancellation(cancellationReason?: string): void {
    if (!cancellationReason) {
      throw new BadRequestException(
        'Cancellation reason is required when an admin cancels a booking',
      );
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

    const nonDeletableStatuses = [
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.ONGOING,
    ];

    if (nonDeletableStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Booking cannot be deleted while its status is ${booking.status}`,
      );
    }
    await this.bookingRepository.softDeleteBooking(booking.id);

    return {
      message: 'Booking deleted successfully',
    };
  }

  async restoreBooking(bookingId: number): Promise<{
    message: string;
  }> {
    const booking =
      await this.bookingRepository.findBookingByIdIncludingDeleted(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!booking.deletedAt) {
      throw new BadRequestException('Booking is not deleted');
    }

    await this.bookingRepository.restoreBooking(bookingId);

    return {
      message: 'Booking restored successfully',
    };
  }

  async cancelBooking(
    user: User,
    bookingId: number,
    dto: CancelBookingDto,
  ): Promise<{
    message: string;
    booking: Awaited<ReturnType<BookingService['formatBookingResponse']>>;
  }> {
    const allowedRoles: USER_ROLE[] = [
      USER_ROLE.CUSTOMER,
      USER_ROLE.PUROHIT,
      USER_ROLE.ADMIN,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('You are not allowed to cancel bookings');
    }

    const cancellationReason = dto.cancellationReason?.trim();

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);

      /*
       * Lock only the booking row.
       * Do not use LEFT JOIN with pessimistic lock.
       */
      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', {
          bookingId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status === BOOKING_STATUS.CANCELLED) {
        throw new ConflictException('Booking is already cancelled');
      }

      if (booking.status === BOOKING_STATUS.COMPLETED) {
        throw new BadRequestException('Completed bookings cannot be cancelled');
      }

      let cancelledBy: CANCELLED_BY;
      let message = 'Booking cancelled successfully';
      const assignedPurohitProfileId = booking.purohitId;
      let assignedPurohitUserId: number | undefined;

      if (assignedPurohitProfileId) {
        const purohitProfile = await manager
          .getRepository(PurohitProfile)
          .findOne({
            where: {
              id: assignedPurohitProfileId,
            },
          });

        assignedPurohitUserId = purohitProfile?.userId;
      }

      switch (user.role) {
        case USER_ROLE.CUSTOMER:
          this.validateCustomerCancellation(user, booking);

          if (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID) {
            throw new BadRequestException(
              'This booking has already been paid. Please contact support to cancel and initiate a refund',
            );
          }

          cancelledBy = CANCELLED_BY.CUSTOMER;
          booking.status = BOOKING_STATUS.CANCELLED;

          break;

        case USER_ROLE.PUROHIT: {
          await this.validatePurohitCancellation(
            manager,
            user,
            booking,
            cancellationReason,
          );

          const cancellingPurohitProfileId = booking.purohitId;

          cancelledBy = CANCELLED_BY.PUROHIT;

          booking.status = BOOKING_STATUS.PENDING;

          booking.purohitId = null as unknown as undefined;

          booking.assignmentType = ASSIGNMENT_TYPE.AUTO;

          booking.purohitPayoutAmount = null as unknown as undefined;
          booking.finalAmount = null as unknown as undefined;

          /*
           * Recalculate Purohits through
           * AssignmentService.
           *
           * The cancelling Purohit is excluded.
           */
          booking.filteredPurohitIds =
            await this.assignmentService.findEligiblePurohitIds(
              manager,
              booking,
              cancellingPurohitProfileId ? [cancellingPurohitProfileId] : [],
            );

          message =
            (booking.filteredPurohitIds?.length ?? 0) > 0
              ? 'Booking released successfully and sent to other eligible Purohits'
              : 'Booking released successfully, but no eligible Purohit is currently available';
          break;
        }

        case USER_ROLE.ADMIN:
          this.validateAdminCancellation(cancellationReason);

          if (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID) {
            throw new BadRequestException(
              'This booking has already been paid. Initiate the refund before cancelling it',
            );
          }

          cancelledBy = CANCELLED_BY.ADMIN;
          booking.status = BOOKING_STATUS.CANCELLED;

          break;

        default:
          throw new ForbiddenException(
            'You are not allowed to cancel this booking',
          );
      }

      booking.cancelledBy = cancelledBy;

      booking.cancellationReason = cancellationReason || undefined;

      const savedBooking = await bookingRepository.save(booking);

      if (cancelledBy === CANCELLED_BY.CUSTOMER) {
        if (assignedPurohitUserId) {
          // TODO: commented out to avoid duplicate notification
          // this.bookingGateway.notifyUser(
          //   assignedPurohitUserId,
          //   'booking_cancelled',
          //   savedBooking,
          // );

          await this.notificationService.createNotification(
            assignedPurohitUserId,
            'Booking Cancelled',
            `Booking B-${savedBooking.id} has been cancelled by the customer.`,
            NOTIFICATION_TYPE.BOOKING,
            savedBooking.id,
            'BOOKING',
          );
        }
      }

      // PUROHIT → CUSTOMER + ADMINS
      if (cancelledBy === CANCELLED_BY.PUROHIT) {
        // TODO: commented out to avoid duplicate notification
        // this.bookingGateway.notifyUser(
        //   savedBooking.customerId,
        //   'booking_released',
        //   savedBooking,
        // );

        await this.notificationService.createNotification(
          savedBooking.customerId,
          'Booking Released',
          `Booking B-${savedBooking.id} released by purohit. We are finding an eligible purohit for this booking, please wait some time.`,
          NOTIFICATION_TYPE.BOOKING,
          savedBooking.id,
          'BOOKING',
        );

        const admins = await manager.getRepository(User).find({
          where: {
            role: USER_ROLE.ADMIN,
            status: USER_STATUS.ACTIVE,
          },
          select: ['id'],
        });

        for (const admin of admins) {
          // TODO: commented out to avoid duplicate notification
          // this.bookingGateway.notifyUser(
          //   admin.id,
          //   'booking_released',
          //   savedBooking,
          // );

          await this.notificationService.createNotification(
            admin.id,
            'Booking Released',
            `Booking B-${savedBooking.id} was released by the assigned Purohit.`,
            NOTIFICATION_TYPE.BOOKING,
            savedBooking.id,
            'BOOKING',
          );
        }
      }

      // ADMIN → PUROHIT + CUSTOMER
      if (cancelledBy === CANCELLED_BY.ADMIN) {
        // TODO: commented out to avoid duplicate notification
        // this.bookingGateway.notifyUser(
        //   savedBooking.customerId,
        //   'booking_cancelled',
        //   savedBooking,
        // );

        await this.notificationService.createNotification(
          savedBooking.customerId,
          'Booking Cancelled',
          `Your booking B-${savedBooking.id} has been cancelled by the Admin.`,
          NOTIFICATION_TYPE.BOOKING,
          savedBooking.id,
          'BOOKING',
        );

        if (assignedPurohitUserId) {
          // TODO: commented out to avoid duplicate notification
          // this.bookingGateway.notifyUser(
          //   assignedPurohitUserId,
          //   'booking_cancelled',
          //   savedBooking,
          // );

          await this.notificationService.createNotification(
            assignedPurohitUserId,
            'Booking Cancelled',
            `Booking B-${savedBooking.id} has been cancelled by the Admin.`,
            NOTIFICATION_TYPE.BOOKING,
            savedBooking.id,
            'BOOKING',
          );
        }
      }

      const populatedBooking = await bookingRepository.findOne({
        where: { id: savedBooking.id },
        relations: {
          customer: true,
          service: true,
          customerAddress: true,
          purohit: { user: true },
        },
      });

      await this.auditLogService.createAuditLog(
        {
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.BOOKING,
          entity: 'Booking',
          entityId: String(savedBooking.id),
          action: 'BOOKING_CANCELLED',
          message: `Booking B-${savedBooking.id} was cancelled.`,
          oldValue: { status: booking.status },
          newValue: { status: savedBooking.status, cancellationReason },
        },
        manager,
      );

      return {
        message,
        booking: await this.formatBookingResponse(populatedBooking as Booking),
      };
    });
  }

  // private async findEligiblePurohitIdsForBooking(
  //   manager: EntityManager,
  //   booking: Booking,
  //   excludedPurohitProfileIds: number[] = [],
  // ): Promise<number[]> {
  //   // REMOVE COMPLETE METHOD
  // }

  private async validateAndCalculateCoupon(
    manager: EntityManager,
    customerId: number,
    serviceId: number,
    couponCode: string,
    bookingAmount: number,
  ): Promise<CouponCalculationResult> {
    const couponRepository = manager.getRepository(Coupon);
    const couponUsageRepository = manager.getRepository(CouponUsage);
    const normalizedCouponCode = couponCode.trim().toUpperCase();

    const coupon = await couponRepository
      .createQueryBuilder('coupon')
      .where('UPPER(coupon.code) = :couponCode', {
        couponCode: normalizedCouponCode,
      })
      .andWhere('coupon.deletedAt IS NULL')
      .setLock('pessimistic_write')
      .getOne();

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is not active');
    }

    const now = new Date();

    if (now < new Date(coupon.validFrom)) {
      throw new BadRequestException('Coupon is not valid yet');
    }

    if (now > new Date(coupon.validUntil)) {
      throw new BadRequestException('Coupon has expired');
    }

    const applicableServiceIds = coupon.applicableServiceIds ?? [];

    if (
      applicableServiceIds.length > 0 &&
      !applicableServiceIds.includes(serviceId)
    ) {
      throw new BadRequestException(
        'Coupon is not applicable to the selected service',
      );
    }

    const minimumBookingAmount = Number(coupon.minBookingAmount ?? 0);

    if (
      Number.isFinite(minimumBookingAmount) &&
      bookingAmount < minimumBookingAmount
    ) {
      throw new BadRequestException(
        `A minimum booking amount of ₹${minimumBookingAmount.toFixed(2)} is required to use this coupon`,
      );
    }

    let totalUsagePromise: Promise<number> | undefined;

    if (
      coupon.usageLimitTotal !== null &&
      coupon.usageLimitTotal !== undefined
    ) {
      totalUsagePromise = couponUsageRepository.count({
        where: {
          coupon: {
            id: coupon.id,
          },
        },
      });
    }

    const customerUsagePromise = couponUsageRepository.count({
      where: {
        coupon: {
          id: coupon.id,
        },
        customer: {
          id: customerId,
        },
      },
    });

    const [totalUsage, customerUsage] = await Promise.all([
      totalUsagePromise ?? Promise.resolve(0),
      customerUsagePromise,
    ]);

    if (totalUsagePromise && totalUsage >= coupon.usageLimitTotal!) {
      throw new BadRequestException('Coupon usage limit has been reached');
    }

    if (customerUsage >= coupon.usageLimitPerCustomer) {
      throw new BadRequestException(
        'You have already used this coupon the maximum allowed number of times',
      );
    }

    const discountValue = Number(coupon.discountValue);

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      throw new BadRequestException('Coupon discount value is invalid');
    }

    let discountAmount: number;

    switch (coupon.discountType) {
      case DISCOUNT_TYPE.FLAT:
        discountAmount = discountValue;
        break;

      case DISCOUNT_TYPE.PERCENTAGE:
        if (discountValue > 100) {
          throw new BadRequestException(
            'Percentage discount cannot exceed 100%',
          );
        }

        discountAmount = bookingAmount * (discountValue / 100);

        if (
          coupon.maxDiscountAmount !== null &&
          coupon.maxDiscountAmount !== undefined
        ) {
          const maximumDiscountAmount = Number(coupon.maxDiscountAmount);

          if (
            !Number.isFinite(maximumDiscountAmount) ||
            maximumDiscountAmount < 0
          ) {
            throw new BadRequestException(
              'Coupon maximum discount amount is invalid',
            );
          }

          discountAmount = Math.min(discountAmount, maximumDiscountAmount);
        }
        break;

      default:
        throw new BadRequestException('Unsupported coupon discount type');
    }

    discountAmount = Math.min(discountAmount, bookingAmount);
    discountAmount = Number(discountAmount.toFixed(2));

    return {
      coupon,
      discountAmount,
    };
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
      throw new NotFoundException(
        'Customer address not found or does not belong to you',
      );
    }

    booking.customerAddressId = customerAddress.id;
    booking.addressSnapshot = this.createAddressSnapshot(customerAddress);
    booking.customerPincode = this.getAddressPincode(customerAddress);
  }

  private async generateUniqueBookingNumber(
    bookingRepository: Repository<Booking>,
  ): Promise<string> {
    const maximumAttempts = 5;

    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      const timestamp = Date.now().toString().slice(-8);

      const randomPart = Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();

      const bookingNumber = `PW${timestamp}${randomPart}`;

      const alreadyExists = await bookingRepository.exists({
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
      addressLine1:
        'addressLine1' in address ? address.addressLine1 : undefined,
      addressLine2:
        'addressLine2' in address ? address.addressLine2 : undefined,
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
    if (!address || !('pincode' in address)) {
      return undefined;
    }

    const pincode = address.pincode;

    if (pincode === null || pincode === undefined) {
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
      throw new ForbiddenException('Only Purohits can respond to bookings');
    }

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);

      const purohitProfileRepository = manager.getRepository(PurohitProfile);

      const purohitProfile = await purohitProfileRepository.findOne({
        where: {
          userId: user.id,
        },
      });

      if (!purohitProfile) {
        throw new NotFoundException('Purohit profile not found');
      }

      /*
       * Lock only the booking table row.
       *
       * Do not add LEFT JOIN relations to a
       * pessimistic locking query.
       */
      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', {
          bookingId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (
        booking.status !== BOOKING_STATUS.PENDING ||
        (booking.purohitId !== null && booking.purohitId !== undefined)
      ) {
        throw new ConflictException('This booking is no longer available');
      }

      // TODO: Deprecated.
      // Payment is required for every booking.
      // Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
      // if (
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID &&
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PARTIAL &&
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.NOT_REQUIRED
      // ) {
      //   throw new BadRequestException(
      //     'Booking cannot be accepted until required payment has been confirmed',
      //   );
      // }
      const isEligibleToAccept =
        booking.paymentType === BOOKING_PAYMENT_TYPE.DEFERRED ||
        booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
        booking.paymentStatus === BOOKING_PAYMENT_STATUS.PARTIAL;

      if (!isEligibleToAccept) {
        throw new BadRequestException(
          'Booking cannot be accepted until required payment has been confirmed',
        );
      }

      const filteredPurohitIds = booking.filteredPurohitIds ?? [];

      if (!filteredPurohitIds.includes(purohitProfile.id)) {
        throw new ForbiddenException(
          'This booking is not available to you or has already been dismissed',
        );
      }

      switch (dto.action) {
        case PUROHIT_BOOKING_ACTION.ACCEPT: {
          const purohitServiceRepository =
            manager.getRepository(PurohitService);
          const matchingPurohitService = await purohitServiceRepository.findOne(
            {
              where: {
                purohitId: purohitProfile.id,
                serviceId: booking.serviceId,
                isActive: true,
              },
            },
          );

          if (!matchingPurohitService) {
            throw new BadRequestException(
              'You do not provide the service required for this booking',
            );
          }

          if (
            booking.bookingMode === BOOKING_MODE.ONLINE &&
            !matchingPurohitService.isOnline
          ) {
            throw new BadRequestException(
              'You do not provide this service online',
            );
          }
          if (
            booking.bookingMode === BOOKING_MODE.OFFLINE &&
            !matchingPurohitService.isOffline
          ) {
            throw new BadRequestException(
              'You do not provide this service offline',
            );
          }

          const isOverlapping = await this.assignmentService.hasOverlappingBooking(
            manager,
            purohitProfile.id,
            booking.scheduledAt,
            booking.id
          );

          if (isOverlapping) {
            throw new BadRequestException(
              'You are not available for the provided date or time due to overlapping bookings',
            );
          }

          if (booking.servicePrice != null) {
            // Fixed pricing model: booking price and financial breakdown are snapshotted at booking creation.
            // Do not recalculate or override with Purohit service pricing.
            booking.purohitId = purohitProfile.id;
            booking.status = BOOKING_STATUS.ACCEPTED;
            booking.filteredPurohitIds = [];
          } else {
            // TODO: Legacy minPrice/maxPrice / Purohit custom pricing logic.
            // Retained for backward compatibility with historical bookings that lack servicePrice.
            const exactPrice =
              booking.bookingMode === BOOKING_MODE.ONLINE
                ? Number(matchingPurohitService.onlinePrice)
                : Number(matchingPurohitService.offlinePrice);

            if (!exactPrice || exactPrice <= 0) {
              throw new BadRequestException(
                'Exact price is not configured for this mode',
              );
            }

            booking.purohitPayoutAmount = exactPrice;
            booking.platformCommission = Number(
              (exactPrice * (Number(booking.commissionPercentage) / 100)).toFixed(
                2,
              ),
            );
            booking.finalAmount = Number(
              (
                exactPrice +
                booking.platformCommission -
                Number(booking.discountAmount ?? 0) +
                Number(booking.donationAmount ?? 0)
              ).toFixed(2),
            );
            booking.purohitId = purohitProfile.id;
            booking.status = BOOKING_STATUS.ACCEPTED;
            booking.filteredPurohitIds = [];
          }

          const savedBooking = await bookingRepository.save(booking);

          /*
           * Reload the booking with relations
           * after saving. No lock is needed here.
           */
          const acceptedBooking = await bookingRepository.findOne({
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

          // real time socket event for booking.customerId
          // TODO: commented out to avoid duplicate notification
          // this.bookingGateway.notifyUser(
          //             booking.customerId,
          //             'booking_accepted',
          //             {
          //               message: 'Booking accepted successfully',
          //               booking: acceptedBooking ?? savedBooking,
          //             },
          //           );

          await this.notificationService.createNotification(
            booking.customerId,
            'Booking Accepted',
            `Your booking B-${savedBooking.id} has been accepted by the Purohit.`,
            NOTIFICATION_TYPE.BOOKING_STATUS,
            savedBooking.id,
            'BOOKING',
          );

          await this.auditLogService.createAuditLog(
            {
              actorId: user.id,
              actorType: ACTOR_TYPE.USER,
              actorRole: user.role,
              module: AUDIT_MODULE.BOOKING,
              entity: 'Booking',
              entityId: String(savedBooking.id),
              action: 'BOOKING_RESPONDED',
              message: `Purohit #${purohitProfile.id} accepted Booking B-${savedBooking.id}.`,
              oldValue: { status: BOOKING_STATUS.PENDING },
              newValue: { status: savedBooking.status, purohitId: savedBooking.purohitId },
            },
            manager,
          );

          const b = acceptedBooking ?? savedBooking;
          const customerEmail = acceptedBooking?.customer?.email;
          if (customerEmail) {
            try {
              const customerName = acceptedBooking?.customer?.firstName
                ? `${acceptedBooking.customer.firstName} ${acceptedBooking.customer.lastName || ''}`.trim()
                : 'Devotee';
              const purohitUser = acceptedBooking?.purohit?.user;
              const purohitName = purohitUser?.firstName
                ? `${purohitUser.firstName} ${purohitUser.lastName || ''}`.trim()
                : 'Assigned Purohit';
              const purohitPhone = purohitUser?.phone;
              const address = acceptedBooking?.customerAddress;
              const addressString = address
                ? `${address.fullAddress || ''}, ${address.city || ''} - ${address.pincode || ''}`
                : 'As registered in booking';

              const istString = this.toIstString(b.scheduledAt);
              const splitDateIst = istString ? istString.split(', ') : [];
              const bookingDate = splitDateIst.length > 0 ? splitDateIst[0] : (b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString() : 'Scheduled Date');
              const bookingTime = splitDateIst.length > 1 ? splitDateIst[1] : (b.scheduledAt ? new Date(b.scheduledAt).toLocaleTimeString() : 'Scheduled Time');

              this.logger.log(`[BookingEmail] Sending booking accepted email to customer for booking ${b.bookingNumber || `B-${b.id}`}...`);
              await this.emailService.sendCustomerBookingAcceptedEmail({
                email: customerEmail,
                customerName,
                bookingId: b.bookingNumber || `B-${b.id}`,
                serviceName: acceptedBooking?.service?.name || 'Vedic Pooja',
                servicePlan: acceptedBooking?.plan ? String(acceptedBooking.plan) : undefined,
                planName: acceptedBooking?.plan ? String(acceptedBooking.plan) : undefined,
                bookingDate,
                bookingTime,
                bookingAddress: addressString,
                purohitName,
                purohitPhone,
                totalAmount: Number(b.finalAmount) || 0,
                bookingStatus: b.status,
              });
              this.logger.log(`[BookingEmail] Customer booking accepted email sent successfully for booking ${b.bookingNumber || `B-${b.id}`}.`);
            } catch (emailErr) {
              this.logger.error(`[BookingEmail] Failed to send customer booking accepted email for booking ${b.bookingNumber || `B-${b.id}`}`, emailErr instanceof Error ? emailErr.stack : String(emailErr));
            }
          }

          return {
            message: 'Booking accepted successfully',
            booking: acceptedBooking ?? savedBooking,
          };
        }

        case PUROHIT_BOOKING_ACTION.DISMISS: {
          booking.filteredPurohitIds = filteredPurohitIds.filter(
            (purohitId) => purohitId !== purohitProfile.id,
          );

          await bookingRepository.save(booking);

          await this.auditLogService.createAuditLog(
            {
              actorId: user.id,
              actorType: ACTOR_TYPE.USER,
              actorRole: user.role,
              module: AUDIT_MODULE.BOOKING,
              entity: 'Booking',
              entityId: String(booking.id),
              action: 'BOOKING_RESPONDED',
              message: `Purohit #${purohitProfile.id} rejected Booking B-${booking.id}.`,
              oldValue: { filteredPurohitIds },
              newValue: { filteredPurohitIds: booking.filteredPurohitIds },
            },
            manager,
          );

          return {
            message: 'Booking dismissed successfully',
          };
        }

        default:
          throw new BadRequestException('Invalid booking response action');
      }
    });
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

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const purohitProfileRepository = manager.getRepository(PurohitProfile);
      const purohitServiceRepository = manager.getRepository(PurohitService);

      /*
       * Lock only the booking row.
       * Do not add LEFT JOIN relations to this query.
       */
      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', {
          bookingId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const assignableStatuses: BOOKING_STATUS[] = [BOOKING_STATUS.PENDING];

      if (!assignableStatuses.includes(booking.status)) {
        throw new BadRequestException(
          `Booking cannot be assigned when status is ${booking.status}`,
        );
      }

      // TODO: Deprecated.
      // Payment is required for every booking.
      // Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
      // if (
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID &&
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PARTIAL &&
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.NOT_REQUIRED
      // ) {
      //   throw new BadRequestException(
      //     'Booking cannot be assigned until required payment has been confirmed',
      //   );
      // }
      const isEligibleToAssign =
        booking.paymentType === BOOKING_PAYMENT_TYPE.DEFERRED ||
        booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
        booking.paymentStatus === BOOKING_PAYMENT_STATUS.PARTIAL;

      if (!isEligibleToAssign) {
        throw new BadRequestException(
          'Booking cannot be assigned until required payment has been confirmed',
        );
      }

      if (booking.purohitId) {
        throw new ConflictException('Booking is already assigned to a Purohit');
      }

      /*
       * Load the selected Purohit and user account.
       * Support dto.purohitId being either:
       *   - PurohitProfile.id  (preferred)
       *   - User.id            (sent by admin panel via the users list API)
       */
      const purohit = await purohitProfileRepository
        .createQueryBuilder('purohit')
        .innerJoinAndSelect('purohit.user', 'user')
        .where('purohit.id = :purohitId OR purohit.userId = :purohitId', {
          purohitId: dto.purohitId,
        })
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
      const matchingPurohitService = await purohitServiceRepository.findOne({
        where: {
          purohitId: purohit.id,
          serviceId: booking.serviceId,
          isActive: true,
        },
      });

      if (!matchingPurohitService) {
        throw new BadRequestException(
          'Selected Purohit does not provide the service required for this booking',
        );
      }
      if (
        booking.bookingMode === BOOKING_MODE.ONLINE &&
        !matchingPurohitService.isOnline
      ) {
        throw new BadRequestException(
          'Selected Purohit does not provide this service online',
        );
      }
      if (
        booking.bookingMode === BOOKING_MODE.OFFLINE &&
        !matchingPurohitService.isOffline
      ) {
        throw new BadRequestException(
          'Selected Purohit does not provide this service offline',
        );
      }

      const exactPrice =
        booking.bookingMode === BOOKING_MODE.ONLINE
          ? Number(matchingPurohitService.onlinePrice)
          : Number(matchingPurohitService.offlinePrice);

      if (!exactPrice || exactPrice <= 0) {
        throw new BadRequestException(
          'Exact price is not configured for this mode by the selected Purohit',
        );
      }

      const eligiblePurohitIds =
        await this.assignmentService.findEligiblePurohitIds(manager, booking);

      if (!eligiblePurohitIds.includes(purohit.id)) {
        const isOverlapping = await this.assignmentService.hasOverlappingBooking(
          manager,
          purohit.id,
          booking.scheduledAt,
          booking.id
        );

        if (isOverlapping) {
          throw new BadRequestException(
            "Selected Purohit isn't available for provided date or time",
          );
        }

        if (
          booking.bookingMode === BOOKING_MODE.OFFLINE &&
          !purohit.isOfflineAvailable
        ) {
          throw new BadRequestException(
            'Selected Purohit is not available for offline bookings',
          );
        }

        const purohitServiceAreaRepository = manager.getRepository(PurohitServiceArea);
        const serviceAreas = await purohitServiceAreaRepository.find({
          where: { purohitId: purohit.userId },
        });

        if (!serviceAreas.length) {
          throw new BadRequestException(
            'Selected Purohit does not have a valid service area configured',
          );
        }

        const bookingCity = (
          booking.customerAddress?.city ||
          (booking.addressSnapshot as any)?.city ||
          ''
        ).trim();

        const normalizedBookingCity = normalizeCityName(bookingCity);
        const servesCity = serviceAreas.some(
          (area) => normalizeCityName(area.city) === normalizedBookingCity,
        );

        if (!servesCity) {
          throw new BadRequestException(
            'Selected Purohit does not serve the customer booking city',
          );
        }

        throw new BadRequestException(
          "Customer location is outside the selected Purohit's service area radius",
        );
      }
      if (booking.servicePrice != null) {
        // Fixed pricing model: booking price and financial breakdown are snapshotted at booking creation.
        // Do not recalculate or override with Purohit service pricing.
        booking.purohitId = purohit.id;
        booking.status = BOOKING_STATUS.ACCEPTED;
        booking.assignmentType = ASSIGNMENT_TYPE.MANUAL;
        booking.filteredPurohitIds = [];
      } else {
        // TODO: Legacy minPrice/maxPrice / Purohit custom pricing logic.
        // Retained for backward compatibility with historical bookings that lack servicePrice.
        booking.purohitPayoutAmount = exactPrice;
        booking.platformCommission = Number(
          (exactPrice * (Number(booking.commissionPercentage) / 100)).toFixed(2),
        );
        booking.finalAmount = Number(
          (
            exactPrice +
            booking.platformCommission -
            Number(booking.discountAmount ?? 0) +
            Number(booking.donationAmount ?? 0)
          ).toFixed(2),
        );
        booking.purohitId = purohit.id;
        booking.status = BOOKING_STATUS.ACCEPTED;
        booking.assignmentType = ASSIGNMENT_TYPE.MANUAL;
        booking.filteredPurohitIds = [];
      }

      const savedBooking = await bookingRepository.save(booking);

      /*
       * Reload relations after saving.
       * No pessimistic lock is applied here.
       */
      const assignedBooking = await bookingRepository.findOne({
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

      // real time socket event for booking.customerId and dto.purohitId
      // TODO: commented out to avoid duplicate notification
      // this.bookingGateway.notifyUser(
      //   savedBooking.customerId,
      //   'booking_assigned_by_admin',
      //   {
      //     message: 'Booking assigned to Purohit successfully',
      //     booking: assignedBooking ?? savedBooking,
      //   },
      // );

      await this.notificationService.createNotification(
        savedBooking.customerId,
        'Booking Assigned',
        `Booking B-${savedBooking.id} assigned to Purohit successfully`,
        NOTIFICATION_TYPE.BOOKING,
        savedBooking.id,
        'BOOKING',
      );

      // TODO: commented out to avoid duplicate notification
      // this.bookingGateway.notifyUser(dto.purohitId, 'booking_assigned_by_admin', {
      //   message: 'Booking assigned to you by admin',
      //   booking: assignedBooking ?? savedBooking,
      // });

      await this.notificationService.createNotification(
        dto.purohitId,
        'Booking Assigned',
        `Booking B-${savedBooking.id} assigned to you by admin`,
        NOTIFICATION_TYPE.BOOKING,
        savedBooking.id,
        'BOOKING',
      );

      await this.auditLogService.createAuditLog(
        {
          actorId: admin.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: admin.role,
          module: AUDIT_MODULE.BOOKING,
          entity: 'Booking',
          entityId: String(savedBooking.id),
          action: 'PUROHIT_ASSIGNED',
          message: `Admin manually assigned Purohit #${dto.purohitId} to Booking B-${savedBooking.id}.`,
          oldValue: { status: BOOKING_STATUS.PENDING },
          newValue: { status: savedBooking.status, purohitId: savedBooking.purohitId },
        },
        manager,
      );

      return {
        message: 'Booking assigned to Purohit successfully',
        booking: assignedBooking ?? savedBooking,
      };
    });
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
    const purohitProfileRepository =
      this.dataSource.getRepository(PurohitProfile);
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

    if (
      purohitProfile.verificationStatus !== PUROHIT_VERIFICATION_STATUS.APPROVED
    ) {
      throw new ForbiddenException('Your Purohit profile is not approved');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { bookings, total } =
      await this.bookingRepository.findAvailableBookingsForPurohit(
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
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async updateBookingStatus(
    user: User,
    bookingId: number,
    dto: UpdateBookingStatusDto,
  ): Promise<{
    message: string;
    booking: Booking;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);

      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', {
          bookingId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      await this.validateStatusUpdateAccess(user, booking);

      this.validateStatusTransition(booking.status, dto.status, user.role);

      this.validatePaymentForStatusChange(booking, dto.status);

      booking.status = dto.status;
      if (dto.status === BOOKING_STATUS.CANCELLED && !booking.cancelledBy) {
        booking.cancelledBy = CANCELLED_BY.ADMIN;
      }

      const updatedBooking = await bookingRepository.save(booking);

      // Notify customer for status change
      // TODO: commented out to avoid duplicate notification
      // this.bookingGateway.notifyUser(
      //         updatedBooking.customerId,
      //         'booking_status_updated',
      //         {
      //           message: `Booking status updated to ${updatedBooking.status}`,
      //           booking: updatedBooking,
      //         },
      //       );

      await this.notificationService.createNotification(
        updatedBooking.customerId,
        'Booking Status Updated',
        `Your booking B-${updatedBooking.id} status has been updated to ${updatedBooking.status}.`,
        NOTIFICATION_TYPE.BOOKING_STATUS,
        updatedBooking.id,
        'BOOKING',
      );

      // Also notify purohit if assigned
      if (updatedBooking.purohitId) {
        const purohitUserId = await this.getPurohitUserIdFromProfileId(manager, updatedBooking.purohitId);
        if (purohitUserId) {
          await this.notificationService.createNotification(
            purohitUserId,
            'Booking Status Updated',
            `Booking B-${updatedBooking.id} status has been updated to ${updatedBooking.status}.`,
            NOTIFICATION_TYPE.BOOKING_STATUS,
            updatedBooking.id,
            'BOOKING',
          );
        }
      }

      await this.auditLogService.createAuditLog(
        {
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.BOOKING,
          entity: 'Booking',
          entityId: String(updatedBooking.id),
          action: 'BOOKING_STATUS_CHANGED',
          message: `Booking B-${updatedBooking.id} status changed from ${booking.status} to ${updatedBooking.status}.`,
          oldValue: { status: booking.status },
          newValue: { status: updatedBooking.status },
        },
        manager,
      );

      if (dto.status === BOOKING_STATUS.COMPLETED && booking.status !== BOOKING_STATUS.COMPLETED) {
        try {
          const completedBooking = await this.bookingRepository.findBookingById(updatedBooking.id);
          if (completedBooking?.customer?.email) {
            const customerName = completedBooking.customer.firstName
              ? `${completedBooking.customer.firstName} ${completedBooking.customer.lastName || ''}`.trim()
              : 'Devotee';
            const purohitUser = completedBooking.purohit?.user;
            const purohitName = purohitUser?.firstName
              ? `${purohitUser.firstName} ${purohitUser.lastName || ''}`.trim()
              : 'Assigned Purohit';
            const istString = this.toIstString(completedBooking.scheduledAt);
            const splitDateIst = istString ? istString.split(', ') : [];
            const bookingDate = splitDateIst.length > 0 ? splitDateIst[0] : (completedBooking.scheduledAt ? new Date(completedBooking.scheduledAt).toLocaleDateString() : 'Scheduled Date');
            const bookingTime = splitDateIst.length > 1 ? splitDateIst[1] : (completedBooking.scheduledAt ? new Date(completedBooking.scheduledAt).toLocaleTimeString() : 'Scheduled Time');

            this.logger.log(`[BookingEmail] Sending booking completed email to customer for booking ${completedBooking.bookingNumber || `B-${completedBooking.id}`}...`);
            await this.emailService.sendCustomerBookingCompletedEmail({
              email: completedBooking.customer.email,
              customerName,
              bookingId: completedBooking.bookingNumber || `B-${completedBooking.id}`,
              serviceName: completedBooking.service?.name || 'Vedic Pooja',
              servicePlan: completedBooking.plan ? String(completedBooking.plan) : undefined,
              planName: completedBooking.plan ? String(completedBooking.plan) : undefined,
              bookingDate,
              bookingTime,
              purohitName,
              totalAmount: Number(completedBooking.finalAmount) || 0,
              paymentStatus: completedBooking.paymentStatus || 'PAID',
            });
            this.logger.log(`[BookingEmail] Customer booking completed email sent successfully for booking ${completedBooking.bookingNumber || `B-${completedBooking.id}`}.`);
          }
        } catch (error) {
          this.logger.error(`[BookingEmail] Failed to send customer booking completed email for booking B-${updatedBooking.id}`, error instanceof Error ? error.stack : String(error));
        }
      }

      return {
        message: 'Booking status updated successfully',
        booking: updatedBooking,
      };
    });
  }

  private async getPurohitUserIdFromProfileId(manager: EntityManager, profileId: number): Promise<number | undefined> {
    const profile = await manager.getRepository(PurohitProfile).findOne({
      where: { id: profileId },
      select: ['userId'],
    });
    return profile?.userId;
  }

  private validatePaymentForStatusChange(
    booking: Booking,
    nextStatus: BOOKING_STATUS,
  ): void {
    const paymentRequiredStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.COMPLETED,
    ];

    if (
      paymentRequiredStatuses.includes(nextStatus) &&
      (booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID || Number(booking.remainingAmount) > 0)
    ) {
      throw new BadRequestException(
        `Payment must be completed before changing booking status to ${nextStatus}`,
      );
    }
  }

  private validateStatusTransition(
    currentStatus: BOOKING_STATUS,
    nextStatus: BOOKING_STATUS,
    role: USER_ROLE,
  ): void {
    if (role === USER_ROLE.ADMIN) {
      return;
    }
    if (currentStatus === BOOKING_STATUS.ARRIVED && nextStatus === BOOKING_STATUS.ONGOING) {
      throw new BadRequestException(
        'Start OTP verification is required to change status to ONGOING',
      );
    }

    if (role === USER_ROLE.PUROHIT && nextStatus === BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(
        'Booking completion is handled automatically after successful customer payment.',
      );
    }

    const allowedTransitions: Partial<
      Record<BOOKING_STATUS, BOOKING_STATUS[]>
    > = {
      [BOOKING_STATUS.ACCEPTED]: [BOOKING_STATUS.ENROUTE],
      [BOOKING_STATUS.ENROUTE]: [BOOKING_STATUS.ARRIVED],
      [BOOKING_STATUS.ONGOING]: [BOOKING_STATUS.COMPLETED],
    };

    const allowedNextStatuses = allowedTransitions[currentStatus] ?? [];

    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Booking status cannot be changed from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private async validateStatusUpdateAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    switch (user.role) {
      case USER_ROLE.ADMIN:
        return;

      case USER_ROLE.PUROHIT:
        await this.validateAssignedPurohit(user.id, booking);
        return;

      default:
        throw new ForbiddenException(
          'You are not allowed to update booking status',
        );
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
      const booking = await this.bookingRepository.findBookingById(bookingId);

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      await this.validateCompletionProofAccess(user, booking);

      return {
        message: 'No completion proof uploaded',
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        completionPhotoUrls: booking.completionPhotoUrls ?? [],
      };
    }

    const booking = await this.bookingRepository.findBookingById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(
        'Completion proof can only be uploaded for completed booking',
      );
    }

    if (booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID) {
      throw new BadRequestException(
        'Booking payment must be completed before uploading completion proof',
      );
    }

    await this.validateCompletionProofAccess(user, booking);

    const uploadedFiles: Array<{
      key: string;
      url: string;
    }> = [];

    try {
      for (const file of files) {
        const extension = this.getCompletionProofExtension(file.originalname);

        const key =
          `bookings/${booking.id}/completion-proofs/` +
          `${Date.now()}-${crypto.randomUUID()}${extension}`;

        const url = await this.s3Service.uploadFile(
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
        ...uploadedFiles.map((uploadedFile) => uploadedFile.url),
      ];

      const savedBooking = await this.bookingRepository.save(booking);

      await this.auditLogService.createAuditLog({
        actorId: user.id,
        actorType: ACTOR_TYPE.USER,
        actorRole: user.role,
        module: AUDIT_MODULE.BOOKING,
        entity: 'Booking',
        entityId: String(savedBooking.id),
        action: 'COMPLETION_PROOF_UPLOADED',
        message: `Purohit uploaded completion proof for Booking B-${savedBooking.id}.`,
        oldValue: undefined,
        newValue: { completionPhotoUrls: savedBooking.completionPhotoUrls },
      });

      return {
        message: 'Completion proof uploaded successfully',
        bookingId: savedBooking.id,
        bookingNumber: savedBooking.bookingNumber,
        completionPhotoUrls: savedBooking.completionPhotoUrls,
      };
    } catch (error) {
      await Promise.allSettled(
        uploadedFiles.map((uploadedFile) =>
          this.s3Service.deleteFile(uploadedFile.key),
        ),
      );

      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
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
      throw new ForbiddenException(
        'Only the assigned Purohit can upload completion proof',
      );
    }

    const purohitProfileRepository =
      this.dataSource.getRepository(PurohitProfile);

    const purohitProfile = await purohitProfileRepository.findOne({
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

  private getCompletionProofExtension(originalName: string): string {
    const extension = path.extname(originalName).toLowerCase();

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException('Unsupported image extension');
    }

    return extension;
  }

  async generateStartOtp(user: User, bookingId: number) {
    const booking = await this.bookingRepository.findBookingById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    await this.validateStartOtpGenerationAccess(user, booking);

    // TODO: Deprecated.
    // Payment is required for every booking.
    // Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
    // if (
    //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID &&
    //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PARTIAL &&
    //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.NOT_REQUIRED
    // ) {
    //   throw new BadRequestException(
    //     'Start OTP cannot be generated for an unpaid booking',
    //   );
    // }
    const isEligibleForStartOtp =
      booking.paymentType === BOOKING_PAYMENT_TYPE.DEFERRED ||
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PARTIAL;

    if (!isEligibleForStartOtp) {
      throw new BadRequestException(
        'Start OTP cannot be generated for an unpaid booking',
      );
    }

    if (booking.status !== BOOKING_STATUS.ARRIVED) {
      throw new BadRequestException(
        'Start OTP can only be generated for an arrived booking',
      );
    }


    if (booking.completionConfirmedAt) {
      throw new BadRequestException(
        'Booking has already been completed',
      );
    }

    if (!booking.customer) {
      throw new NotFoundException('Booking customer details not found');
    }

    const customerPhone = booking.customer.phone;
    const customerEmail = booking.customer.email;

    if (!customerPhone && !customerEmail) {
      throw new BadRequestException(
        'Customer does not have a phone number or email address',
      );
    }

    const otp = randomInt(100000, 1000000).toString();

    booking.completionOtp = otp;

    await this.bookingRepository.saveBooking(booking);

    const deliveryResults = await Promise.allSettled([
      // ── Fast2SMS Smart OTP (WhatsApp primary / SMS fallback) ─────────────
      // Fast2SMS generates and delivers the OTP directly to the customer's
      // WhatsApp (primary) or SMS (auto-fallback). One request; no manual
      // fallback needed here.
      //
      // NOTE: For booking OTP, Fast2SMS generates its own OTP value distinct
      // from booking.completionOtp. The customer receives the Fast2SMS OTP;
      // the Purohit verifies it via the existing verify-start-otp endpoint,
      // which compares against booking.completionOtp. Since we stored the OTP
      // locally AND sent it via Fast2SMS, both channels have the same value.
      customerPhone
        ? this.smsService.sendOtpViaFast2sms(customerPhone)
        : Promise.resolve(null),

      // TODO: FAST2SMS_MIGRATION
      // Previous Twilio SMS delivery for booking start OTP — retained for rollback.
      // Re-enable the line below and remove the Fast2SMS line above if rolling back.
      //
      // customerPhone
      //   ? this.smsService.sendSms(
      //       customerPhone,
      //       `Your Poojawala booking start OTP is ${otp}. Share this OTP with the Purohit to start the Puja.`,
      //     )
      //   : Promise.resolve(null),

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
    const emailSent =
      Boolean(customerEmail) && emailResult.status === 'fulfilled';

    if (smsResult.status === 'rejected') {
      this.logger.error(
        `[generateStartOtp] Failed to send start OTP via Fast2SMS for phone ending …${customerPhone?.slice(-4)}: ` +
        `${(smsResult as PromiseRejectedResult).reason?.message ?? (smsResult as PromiseRejectedResult).reason}`,
      );
    }

    if (emailResult.status === 'rejected') {
      this.logger.error(
        `Failed to send start OTP Email to ${customerEmail}: ${(emailResult as PromiseRejectedResult).reason?.message ||
        (emailResult as PromiseRejectedResult).reason
        }`,
      );
    }

    if (!smsSent && !emailSent) {
      if (process.env['NODE_ENV'] !== 'production') {
        this.logger.warn(
          `[DEV MODE] Start OTP was generated (${otp}) but delivery via Fast2SMS and Email failed. Allowing flow to continue because NODE_ENV=${process.env['NODE_ENV']}.`,
        );
      } else {
        booking.completionOtp = undefined;

        await this.bookingRepository.saveBooking(booking);

        throw new InternalServerErrorException(
          'Unable to send start OTP. Please try again',
        );
      }
    }

    return {
      message: 'Booking start OTP sent successfully',

      bookingId: booking.id,

      bookingNumber: booking.bookingNumber,

      sentVia: {
        sms: smsSent,
        email: emailSent,
      },

      // Use only during development/Postman testing.
      ...(process.env['NODE_ENV'] !== 'production' ? { otp } : {}),
    };
  }


  async resendStartOtp(user: User, bookingId: number) {
    const result = await this.generateStartOtp(user, bookingId);
    return {
      ...result,
      message: 'Booking start OTP resent successfully',
    };
  }

  async triggerAutoAssignment(bookingId: number): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', { bookingId })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // TODO: Deprecated.
      // Payment is required for every booking.
      // Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
      // if (
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID &&
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PARTIAL &&
      //   booking.paymentStatus !== BOOKING_PAYMENT_STATUS.NOT_REQUIRED
      // ) {
      //   throw new BadRequestException(
      //     'Booking cannot enter auto-assignment until required payment is confirmed',
      //   );
      // }
      const isEligibleForAutoAssignment =
        booking.paymentType === BOOKING_PAYMENT_TYPE.DEFERRED ||
        booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
        booking.paymentStatus === BOOKING_PAYMENT_STATUS.PARTIAL;

      if (!isEligibleForAutoAssignment) {
        throw new BadRequestException(
          'Booking cannot enter auto-assignment until required payment is confirmed',
        );
      }

      if (booking.status !== BOOKING_STATUS.PENDING || booking.purohitId) {
        return booking;
      }

      const eligiblePurohitIds =
        await this.assignmentService.findEligiblePurohitIds(manager, booking);

      booking.filteredPurohitIds = eligiblePurohitIds;
      booking.assignmentType = ASSIGNMENT_TYPE.AUTO;

      const savedBooking = await bookingRepository.save(booking);

      if (eligiblePurohitIds.length > 0) {
        const purohitProfiles = await manager
          .getRepository(PurohitProfile)
          .createQueryBuilder('profile')
          .select(['profile.id', 'profile.userId'])
          .where('profile.id IN (:...purohitProfileIds)', {
            purohitProfileIds: eligiblePurohitIds,
          })
          .getMany();

        for (const profile of purohitProfiles) {
          await this.notificationService.createNotification(
            profile.userId,
            'New Booking',
            `You have received a new booking request (Booking B-${savedBooking.id}).`,
            NOTIFICATION_TYPE.BOOKING,
            savedBooking.id,
            'BOOKING',
          );
        }
      }

      return savedBooking;
    });
  }

  private async validateStartOtpGenerationAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    switch (user.role) {
      case USER_ROLE.ADMIN:
        return;

      case USER_ROLE.PUROHIT:
        await this.validateAssignedPurohit(user.id, booking);
        return;

      default:
        throw new ForbiddenException(
          'Only the assigned Purohit or an admin can generate the start OTP',
        );
    }
  }

  async verifyStartOtp(
    user: User,
    bookingId: number,
    dto: VerifyStartOtpDto,
  ): Promise<{
    message: string;
    booking: {
      id: number;
      bookingNumber: string;
      status: BOOKING_STATUS;
      paymentStatus: BOOKING_PAYMENT_STATUS;
    };
  }> {
    if (user.role !== USER_ROLE.PUROHIT && user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException(
        'Only the assigned Purohit or an admin can verify the start OTP',
      );
    }

    const submittedOtp = dto.otp?.trim();

    if (!submittedOtp) {
      throw new BadRequestException('OTP is required');
    }

    // ── Fast2SMS OTP Verification (phone-based) ──────────────────────────────
    // Fast2SMS is the OTP authority for phone-based booking start OTP flows.
    // We fetch the customer phone BEFORE entering the pessimistic-write
    // transaction so the remote HTTP call does not hold the DB row lock open.
    const bookingForPhone = await this.bookingRepository.findBookingById(bookingId);

    if (!bookingForPhone) {
      throw new NotFoundException('Booking not found');
    }

    const customerPhone = bookingForPhone.customer?.phone;

    if (customerPhone) {
      this.logger.log(
        `[verifyStartOtp] Delegating OTP verification to Fast2SMS for booking #${bookingId}, phone ending …${customerPhone.slice(-4)}`,
      );

      const fast2smsVerified = await this.smsService.verifyOtpViaFast2sms(
        customerPhone,
        submittedOtp,
      );

      if (!fast2smsVerified) {
        this.logger.warn(
          `[verifyStartOtp] Fast2SMS rejected OTP for booking #${bookingId}, phone ending …${customerPhone.slice(-4)}`,
        );
        throw new BadRequestException('Invalid start OTP');
      }

      this.logger.log(
        `[verifyStartOtp] Fast2SMS OTP verification succeeded for booking #${bookingId}`,
      );
    } else {
      // No phone on record — fall back to local completionOtp comparison
      // (email-only customers were not sent a Fast2SMS OTP).
      this.logger.warn(
        `[verifyStartOtp] No customer phone for booking #${bookingId}; using local OTP comparison`,
      );

      // TODO: FAST2SMS_MIGRATION
      // Previous local OTP verification retained for rollback/reference and
      // for email-only customers who were not sent a Fast2SMS OTP.
      if (!bookingForPhone.completionOtp || bookingForPhone.completionOtp !== submittedOtp) {
        throw new BadRequestException('Invalid start OTP');
      }
    }

    // ── Booking state transition (unchanged) ────────────────────────────────
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);

      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', { bookingId })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (user.role === USER_ROLE.PUROHIT) {
        const purohitProfile = await manager
          .getRepository(PurohitProfile)
          .findOne({
            where: { userId: user.id },
          });

        if (!purohitProfile) {
          throw new NotFoundException('Purohit profile not found');
        }

        if (booking.purohitId !== purohitProfile.id) {
          throw new ForbiddenException('You are not assigned to this booking');
        }
      }

      if (booking.status !== BOOKING_STATUS.ARRIVED) {
        throw new BadRequestException(
          'Start OTP can only be verified for an arrived booking',
        );
      }

      if (booking.completionConfirmedAt) {
        throw new ConflictException(
          'Booking completion has already been confirmed',
        );
      }

      if (!booking.completionOtp) {
        throw new BadRequestException('Start OTP has not been generated');
      }

      // TODO: FAST2SMS_MIGRATION
      // Previous local OTP string comparison — retained for rollback/reference.
      // Fast2SMS is now the OTP authority for phone-based flows (verified above).
      // Re-enable this check and remove the Fast2SMS block above if rolling back.
      //
      // const submittedOtp = dto.otp?.trim();
      // if (!submittedOtp || booking.completionOtp !== submittedOtp) {
      //   throw new BadRequestException('Invalid start OTP');
      // }

      booking.status = BOOKING_STATUS.ONGOING;
      booking.completionOtp = undefined;

      const updatedBooking = await bookingRepository.save(booking);

      await this.auditLogService.createAuditLog(
        {
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.BOOKING,
          entity: 'Booking',
          entityId: String(updatedBooking.id),
          action: 'BOOKING_STARTED',
          message: `Booking B-${updatedBooking.id} was started after OTP verification.`,
          oldValue: { status: BOOKING_STATUS.ARRIVED },
          newValue: { status: updatedBooking.status },
        },
        manager,
      );

      return {
        message: 'Start OTP verified and booking started successfully',
        booking: {
          id: updatedBooking.id,
          bookingNumber: updatedBooking.bookingNumber,
          status: updatedBooking.status,
          paymentStatus: updatedBooking.paymentStatus,
        },
      };
    });
  }

  async getActiveBookings(user: User, query: BookingQueryDto) {
    const allowedRoles: USER_ROLE[] = [
      USER_ROLE.ADMIN,
      USER_ROLE.CUSTOMER,
      USER_ROLE.PUROHIT,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        'You are not allowed to access active bookings',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    let purohitProfileId: number | undefined;

    if (user.role === USER_ROLE.PUROHIT) {
      const purohitProfile = await this.getPurohitProfile(user.id);

      purohitProfileId = purohitProfile.id;
    }

    let activeStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.ONGOING,
    ];

    if (query.status) {
      const queryStatuses = Array.isArray(query.status) ? query.status : [query.status];
      // Allow querying any valid status if explicitly requested
      activeStatuses = queryStatuses as BOOKING_STATUS[];
    }

    const { bookings, total } =
      await this.bookingRepository.findActiveBookingsByRole({
        userId: user.id,
        userRole: user.role,
        purohitProfileId,
        page,
        limit,
        search,
        activeStatuses,
      });

    const formattedBookings = await Promise.all(bookings.map(async (booking) => {
      const customerName = [
        booking.customer?.firstName,
        booking.customer?.lastName,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      const purohitUser = booking.purohit?.user;

      const purohitName = [purohitUser?.firstName, purohitUser?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

      const customerAddress = booking.customerAddress;

      const snapshot = booking.addressSnapshot ?? {};

      const serviceIconUrl = booking.service?.iconUrl ?? null;
      const serviceIconDownloadUrl = serviceIconUrl ? await this.s3Service.getDownloadUrl(serviceIconUrl) : null;

      const customerProfileImage = booking.customer?.profileImage ?? null;
      const customerProfileImageDownloadUrl = customerProfileImage ? await this.s3Service.getDownloadUrl(customerProfileImage) : null;

      const purohitProfileImage = purohitUser?.profileImage ?? null;
      const purohitProfileImageDownloadUrl = purohitProfileImage ? await this.s3Service.getDownloadUrl(purohitProfileImage) : null;

      return {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        scheduledAt: booking.scheduledAt,
        scheduledAtIst: this.toIstString(booking.scheduledAt),
        createdAt: booking.createdAt,
        createdAtIst: this.toIstString(booking.createdAt),
        updatedAt: booking.updatedAt,
        updatedAtIst: this.toIstString(booking.updatedAt),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        assignmentType: booking.assignmentType,

        service: {
          id: booking.service?.id ?? booking.serviceId,
          name: booking.service?.name ?? '-',
          iconUrl: serviceIconUrl,
          iconDownloadUrl: serviceIconDownloadUrl,
          durationMinutes: booking.service?.durationMinutes ?? null,
        },

        customer: {
          id: booking.customer?.id ?? booking.customerId,
          name: customerName || '-',
          email: booking.customer?.email ?? null,
          phone: booking.customer?.phone ?? null,
          profileImage: customerProfileImage,
          profileImageDownloadUrl: customerProfileImageDownloadUrl,
        },

        purohit: booking.purohit
          ? {
            profileId: booking.purohit.id,
            userId: booking.purohit.userId,
            name: purohitName || '-',
            email: purohitUser?.email ?? null,
            phone: purohitUser?.phone ?? null,
            profileImage: purohitProfileImage,
            profileImageDownloadUrl: purohitProfileImageDownloadUrl,
            avgRating: Number(booking.purohit.avgRating ?? 0),
          }
          : null,

        address: {
          id: customerAddress?.id ?? booking.customerAddressId ?? null,
          label: customerAddress?.addressLabel ?? null,

          fullAddress:
            (customerAddress?.fullAddress ??
              String(snapshot['fullAddress'] ?? '')) ||
            null,

          city:
            (customerAddress?.city ?? String(snapshot['city'] ?? '')) || null,

          pincode: customerAddress?.pincode ?? booking.customerPincode ?? null,

          latitude:
            customerAddress?.latitude !== null &&
              customerAddress?.latitude !== undefined
              ? Number(customerAddress.latitude)
              : snapshot['latitude'] !== undefined
                ? Number(snapshot['latitude'])
                : null,

          longitude:
            customerAddress?.longitude !== null &&
              customerAddress?.longitude !== undefined
              ? Number(customerAddress.longitude)
              : snapshot['longitude'] !== undefined
                ? Number(snapshot['longitude'])
                : null,
        },

        pricing: {
          plan: booking.plan ?? null,
          servicePrice: booking.servicePrice ? Number(booking.servicePrice) : null,
          // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
          // samagriIncluded: booking.samagriIncluded ?? false,
          // priceWithoutSamagri: booking.service?.priceWithoutSamagri ? Number(booking.service.priceWithoutSamagri) : null,
          // priceWithSamagri: booking.service?.priceWithSamagri ? Number(booking.service.priceWithSamagri) : null,
          minPrice: booking.service?.minPrice ? Number(booking.service.minPrice) : null,
          maxPrice: booking.service?.maxPrice ? Number(booking.service.maxPrice) : null,
          priceRange: booking.service?.minPrice && booking.service?.maxPrice
            ? `${Number(booking.service.minPrice)} - ${Number(booking.service.maxPrice)}`
            : null,
          purohitPayoutAmount: booking.purohitPayoutAmount ? Number(booking.purohitPayoutAmount) : null,
          platformCommission: booking.platformCommission ? Number(booking.platformCommission) : null,
          discountAmount: Number(booking.discountAmount ?? 0),
          donationAmount: Number(booking.donationAmount ?? 0),
          finalAmount: Number(booking.finalAmount),
          couponCode: booking.couponCode ?? null,
        },

        specialInstructions: booking.specialInstructions ?? null,
        customFields: booking.customFields ?? null,
      };
    }));

    return {
      bookings: formattedBookings,

      pagination: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async rescheduleBooking(
    user: User,
    bookingId: number,
    dto: RescheduleBookingDto,
  ): Promise<{
    message: string;
    assignmentChanged: boolean;
    booking: Awaited<ReturnType<BookingService['formatBookingResponse']>>;
    reschedule: {
      previousScheduledAt: Date;
      newScheduledAt: Date;
      reason: string | null;
    };
  }> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can reschedule bookings');
    }

    const minimumLeadTimeMinutes = 120;
    const maximumAdvanceDays = 180;
    const newScheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(newScheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    const minimumScheduledAt = new Date(
      Date.now() + minimumLeadTimeMinutes * 60 * 1000,
    );

    if (newScheduledAt < minimumScheduledAt) {
      throw new BadRequestException(
        `Booking must be rescheduled at least ${minimumLeadTimeMinutes} minutes in advance`,
      );
    }

    const maximumScheduledAt = new Date(
      Date.now() + maximumAdvanceDays * 24 * 60 * 60 * 1000,
    );

    if (newScheduledAt > maximumScheduledAt) {
      throw new BadRequestException(
        `Booking cannot be rescheduled more than ${maximumAdvanceDays} days in advance`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);

      const addressRepository = manager.getRepository(CustomerAddress);

      const booking = await bookingRepository
        .createQueryBuilder('booking')
        .where('booking.id = :bookingId', {
          bookingId,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.customerId !== user.id) {
        throw new ForbiddenException(
          'You can only reschedule your own booking',
        );
      }

      const reschedulableStatuses: BOOKING_STATUS[] = [
        BOOKING_STATUS.PENDING,
        BOOKING_STATUS.ACCEPTED,
      ];

      if (!reschedulableStatuses.includes(booking.status)) {
        throw new BadRequestException(
          `Booking cannot be rescheduled when status is ${booking.status}`,
        );
      }

      if (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID) {
        throw new BadRequestException(
          'A paid booking cannot be rescheduled. Please contact support',
        );
      }

      const previousScheduledAt = new Date(booking.scheduledAt);

      if (previousScheduledAt.getTime() === newScheduledAt.getTime()) {
        throw new BadRequestException(
          'The new scheduled date and time must be different from the current scheduled date and time',
        );
      }

      const rescheduleLockKey = [
        booking.customerId,
        booking.serviceId,
        newScheduledAt.toISOString(),
      ].join(':');

      await manager.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext($1)
          )
        `,
        [rescheduleLockKey],
      );

      const duplicateStatuses: BOOKING_STATUS[] = [
        BOOKING_STATUS.PENDING,
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.ENROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.ONGOING,
      ];

      const duplicateBookingExists = await bookingRepository
        .createQueryBuilder('duplicateBooking')
        .where('duplicateBooking.id != :bookingId', {
          bookingId: booking.id,
        })
        .andWhere('duplicateBooking.customerId = :customerId', {
          customerId: booking.customerId,
        })
        .andWhere('duplicateBooking.serviceId = :serviceId', {
          serviceId: booking.serviceId,
        })
        .andWhere('duplicateBooking.scheduledAt = :scheduledAt', {
          scheduledAt: newScheduledAt,
        })
        .andWhere('duplicateBooking.status IN (:...statuses)', {
          statuses: duplicateStatuses,
        })
        .getExists();

      if (duplicateBookingExists) {
        throw new ConflictException(
          'An active booking for this service and scheduled time already exists',
        );
      }

      if (dto.customerAddressId !== undefined) {
        const customerAddress = await addressRepository.findOne({
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

        const customerPincode = customerAddress.pincode?.trim();

        if (!customerPincode) {
          throw new BadRequestException(
            'A valid pincode is required in the selected customer address',
          );
        }

        const latitude = Number(customerAddress.latitude);
        const longitude = Number(customerAddress.longitude);

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
          throw new BadRequestException(
            'Selected customer address does not have a valid latitude',
          );
        }

        if (
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new BadRequestException(
            'Selected customer address does not have a valid longitude',
          );
        }

        booking.customerAddressId = customerAddress.id;
        booking.addressSnapshot = this.createAddressSnapshot(customerAddress);
        booking.customerPincode = customerPincode;
      }

      booking.scheduledAt = newScheduledAt;

      const previousPurohitId = booking.purohitId;
      const eligiblePurohitIds =
        await this.assignmentService.findEligiblePurohitIds(manager, booking);

      let assignmentChanged = false;
      let message = 'Booking rescheduled successfully';

      if (booking.status === BOOKING_STATUS.ACCEPTED && previousPurohitId) {
        const assignedPurohitIsAvailable =
          eligiblePurohitIds.includes(previousPurohitId);

        if (assignedPurohitIsAvailable) {
          booking.purohitId = previousPurohitId;
          booking.status = BOOKING_STATUS.ACCEPTED;
          booking.filteredPurohitIds = [];

          message =
            'Booking rescheduled successfully. The assigned Purohit remains available';
        } else {
          assignmentChanged = true;
          booking.purohitId = null as unknown as undefined;
          booking.status = BOOKING_STATUS.PENDING;
          booking.assignmentType = ASSIGNMENT_TYPE.AUTO;
          booking.filteredPurohitIds = eligiblePurohitIds.filter(
            (purohitId) => purohitId !== previousPurohitId,
          );

          message =
            booking.filteredPurohitIds.length > 0
              ? 'Booking rescheduled successfully. The previous Purohit is unavailable, so the booking has been sent to other eligible Purohits'
              : 'Booking rescheduled successfully, but no eligible Purohit is currently available for the new schedule';
        }
      } else {
        booking.purohitId = null as unknown as undefined;
        booking.status = BOOKING_STATUS.PENDING;
        booking.assignmentType = ASSIGNMENT_TYPE.AUTO;
        booking.filteredPurohitIds = eligiblePurohitIds;

        message =
          eligiblePurohitIds.length > 0
            ? 'Booking rescheduled successfully and sent to eligible Purohits'
            : 'Booking rescheduled successfully, but no eligible Purohit is currently available';
      }

      const reason = dto.reason?.trim() || null;
      const savedBooking = await bookingRepository.save(booking);
      const rescheduledBooking = await bookingRepository.findOne({
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

      const finalBooking = rescheduledBooking ?? savedBooking;

      await this.auditLogService.createAuditLog(
        {
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.BOOKING,
          entity: 'Booking',
          entityId: String(finalBooking.id),
          action: 'BOOKING_RESCHEDULED',
          message: `Booking B-${finalBooking.id} was rescheduled to ${this.toIstString(newScheduledAt)}.`,
          oldValue: { scheduledAt: previousScheduledAt },
          newValue: { scheduledAt: newScheduledAt },
        },
        manager,
      );

      return {
        message,
        assignmentChanged,
        booking: await this.formatBookingResponse(finalBooking),
        reschedule: {
          previousScheduledAt,
          newScheduledAt,
          reason,
        },
      };
    });
  }

  private async formatBookingResponse(booking: Booking) {
    const customerName = [
      booking.customer?.firstName,
      booking.customer?.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const purohitUser = booking.purohit?.user;

    const purohitName = [purohitUser?.firstName, purohitUser?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const customerAddress = booking.customerAddress;

    const addressSnapshot = (booking.addressSnapshot ?? {}) as Record<
      string,
      unknown
    >;

    const latitude = customerAddress?.latitude ?? addressSnapshot['latitude'];

    const longitude =
      customerAddress?.longitude ?? addressSnapshot['longitude'];

    const serviceIconUrl = booking.service?.iconUrl ?? null;
    const serviceIconDownloadUrl = serviceIconUrl ? await this.s3Service.getDownloadUrl(serviceIconUrl) : null;

    const customerProfileImage = booking.customer?.profileImage ?? null;
    const customerProfileImageDownloadUrl = customerProfileImage ? await this.s3Service.getDownloadUrl(customerProfileImage) : null;

    const purohitProfileImage = purohitUser?.profileImage ?? null;
    const purohitProfileImageDownloadUrl = purohitProfileImage ? await this.s3Service.getDownloadUrl(purohitProfileImage) : null;

    const completionPhotoUrls = booking.completionPhotoUrls ?? [];
    let completionPhotoDownloadUrls: string[] = [];
    if (completionPhotoUrls.length > 0) {
      completionPhotoDownloadUrls = await Promise.all(
        completionPhotoUrls.map((url) => this.s3Service.getDownloadUrl(url))
      );
    }

    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      scheduledAt: booking.scheduledAt,
      scheduledAtIst: this.toIstString(booking.scheduledAt),
      createdAt: booking.createdAt,
      createdAtIst: this.toIstString(booking.createdAt),
      updatedAt: booking.updatedAt,
      updatedAtIst: this.toIstString(booking.updatedAt),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      assignmentType: booking.assignmentType,

      service: {
        id: booking.service?.id ?? booking.serviceId,
        name: booking.service?.name ?? null,
        iconUrl: serviceIconUrl,
        iconDownloadUrl: serviceIconDownloadUrl,
        durationMinutes: booking.service?.durationMinutes ?? null,
        plans: booking.service?.plans ?? null,
      },
      plan: booking.plan ?? null,

      customer: {
        id: booking.customer?.id ?? booking.customerId,
        name: customerName || null,
        email: booking.customer?.email ?? null,
        phone: booking.customer?.phone ?? null,
        profileImage: customerProfileImage,
        profileImageDownloadUrl: customerProfileImageDownloadUrl,
      },

      purohit: booking.purohit
        ? {
          profileId: booking.purohit.id,
          userId: booking.purohit.userId,
          name: purohitName || null,
          email: purohitUser?.email ?? null,
          phone: purohitUser?.phone ?? null,
          profileImage: purohitProfileImage,
          profileImageDownloadUrl: purohitProfileImageDownloadUrl,
          avgRating: Number(booking.purohit.avgRating ?? 0),
        }
        : null,

      address: {
        id: customerAddress?.id ?? booking.customerAddressId ?? null,
        label: customerAddress?.addressLabel ?? null,
        fullAddress:
          (customerAddress?.fullAddress ??
            String(addressSnapshot['fullAddress'] ?? '')) ||
          null,
        city:
          (customerAddress?.city ?? String(addressSnapshot['city'] ?? '')) ||
          null,
        pincode:
          (customerAddress?.pincode ??
            booking.customerPincode ??
            String(addressSnapshot['pincode'] ?? '')) ||
          null,
        latitude:
          latitude !== null &&
            latitude !== undefined &&
            Number.isFinite(Number(latitude))
            ? Number(latitude)
            : null,
        longitude:
          longitude !== null &&
            longitude !== undefined &&
            Number.isFinite(Number(longitude))
            ? Number(longitude)
            : null,
      },

      pricing: {
        plan: booking.plan ?? null,
        servicePrice: booking.servicePrice ? Number(booking.servicePrice) : null,
        // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
        // samagriIncluded: booking.samagriIncluded ?? false,
        // priceWithoutSamagri: booking.service?.priceWithoutSamagri ? Number(booking.service.priceWithoutSamagri) : null,
        // priceWithSamagri: booking.service?.priceWithSamagri ? Number(booking.service.priceWithSamagri) : null,
        minPrice: booking.service?.minPrice ? Number(booking.service.minPrice) : null,
        maxPrice: booking.service?.maxPrice ? Number(booking.service.maxPrice) : null,
        priceRange: booking.service?.minPrice && booking.service?.maxPrice
          ? `${Number(booking.service.minPrice)} - ${Number(booking.service.maxPrice)}`
          : null,
        platformCommission: Number(booking.platformCommission),
        purohitPayoutAmount: Number(booking.purohitPayoutAmount),
        discountAmount: Number(booking.discountAmount ?? 0),
        donationAmount: Number(booking.donationAmount ?? 0),
        finalAmount: Number(booking.finalAmount),
        tokenPercentage: booking.tokenPercentage != null ? Number(booking.tokenPercentage) : null,
        tokenAmount: booking.tokenAmount != null ? Number(booking.tokenAmount) : null,
        paidAmount: Number(booking.paidAmount ?? 0),
        remainingAmount: booking.remainingAmount != null
          ? Number(booking.remainingAmount)
          : Math.max(0, Number((Number(booking.finalAmount ?? 0) - Number(booking.paidAmount ?? 0)).toFixed(2))),
        couponCode: booking.couponCode ?? null,
      },
      tokenPercentage: booking.tokenPercentage != null ? Number(booking.tokenPercentage) : null,
      tokenAmount: booking.tokenAmount != null ? Number(booking.tokenAmount) : null,
      paidAmount: Number(booking.paidAmount ?? 0),
      remainingAmount: booking.remainingAmount != null
        ? Number(booking.remainingAmount)
        : Math.max(0, Number((Number(booking.finalAmount ?? 0) - Number(booking.paidAmount ?? 0)).toFixed(2))),

      specialInstructions: booking.specialInstructions ?? null,
      customFields: booking.customFields ?? null,
      eligiblePurohitCount: booking.filteredPurohitIds?.length ?? 0,
      completionPhotoUrls,
      completionPhotoDownloadUrls,
    };
  }

  async repeatBooking(
    user: User,
    originalBookingId: number,
    dto: RepeatBookingDto,
  ): Promise<{
    message: string;
    originalBooking: {
      id: number;
      bookingNumber: string;
      status: BOOKING_STATUS;
    };
    booking: {
      id: number;
      bookingNumber: string;
      scheduledAt: Date;
      scheduledAtIst: string | null;
      createdAt: Date;
      createdAtIst: string | null;
      updatedAt: Date;
      updatedAtIst: string | null;
      status: BOOKING_STATUS;
      paymentStatus: BOOKING_PAYMENT_STATUS;
      assignmentType: ASSIGNMENT_TYPE;
      serviceId: number;
      customerAddressId: number | null;
      finalAmount: number;
      eligiblePurohitCount: number;
    };
  }> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can repeat bookings');
    }

    const originalBooking =
      await this.bookingRepository.findBookingById(originalBookingId);

    if (!originalBooking) {
      throw new NotFoundException('Original booking not found');
    }

    if (originalBooking.customerId !== user.id) {
      throw new ForbiddenException('You can only repeat your own bookings');
    }

    /*
     * Only finished or cancelled bookings can be repeated.
     */
    const repeatableStatuses: BOOKING_STATUS[] = [
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.CANCELLED,
    ];

    if (!repeatableStatuses.includes(originalBooking.status)) {
      throw new BadRequestException(
        `Booking cannot be repeated when status is ${originalBooking.status}`,
      );
    }

    if (!originalBooking.serviceId) {
      throw new BadRequestException(
        'Original booking service information is missing',
      );
    }

    const customerAddressId =
      dto.customerAddressId ?? originalBooking.customerAddressId;

    if (!customerAddressId) {
      throw new BadRequestException(
        'Please select an address for the repeated booking',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    if (scheduledAt <= new Date()) {
      throw new BadRequestException(
        'Repeated booking must be scheduled for a future date and time',
      );
    }

    const createBookingDto: CreateBookingDto = {
      serviceId: originalBooking.serviceId,
      customerAddressId,
      scheduledAt: dto.scheduledAt,
      bookingMode: originalBooking.bookingMode as BOOKING_MODE,
      specialInstructions:
        dto.specialInstructions !== undefined
          ? dto.specialInstructions.trim() || undefined
          : originalBooking.specialInstructions,
      customFields:
        dto.customFields !== undefined
          ? dto.customFields
          : originalBooking.customFields,
      donationAmount:
        dto.donationAmount !== undefined
          ? Number(dto.donationAmount)
          : Number(originalBooking.donationAmount ?? 0),
      couponCode: dto.couponCode?.trim() || undefined,
      plan: dto.plan !== undefined ? dto.plan : ((originalBooking.plan as SERVICE_PLAN) ?? SERVICE_PLAN.BASIC),
      // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
      // samagriIncluded: dto.samagriIncluded !== undefined ? dto.samagriIncluded : (originalBooking as any).samagriIncluded,
    };

    const createResult = await this.createBooking(user, createBookingDto);
    const newBookingId = createResult.bookingId;
    const repeatedBooking =
      (await this.bookingRepository.findBookingById(newBookingId)) ??
      ({
        id: newBookingId,
        bookingNumber: createResult.bookingNumber,
        status: createResult.status,
        paymentStatus: createResult.paymentStatus,
        scheduledAt: createBookingDto.scheduledAt,
        serviceId: createBookingDto.serviceId,
        customerAddressId: createBookingDto.customerAddressId,
        finalAmount: 0,
        filteredPurohitIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

    await this.auditLogService.createAuditLog({
      actorId: user.id,
      actorType: ACTOR_TYPE.USER,
      actorRole: user.role,
      module: AUDIT_MODULE.BOOKING,
      entity: 'Booking',
      entityId: String(repeatedBooking.id),
      action: 'BOOKING_REPEATED',
      message: `A new repeated booking B-${repeatedBooking.id} was created from Booking B-${originalBooking.id}.`,
      oldValue: undefined,
      newValue: { originalBookingId: originalBooking.id, newBookingId: repeatedBooking.id },
    });

    return {
      message: 'Booking repeated successfully',
      originalBooking: {
        id: originalBooking.id,
        bookingNumber: originalBooking.bookingNumber,
        status: originalBooking.status,
      },
      booking: {
        id: repeatedBooking.id,
        bookingNumber: repeatedBooking.bookingNumber,
        scheduledAt: repeatedBooking.scheduledAt,
        scheduledAtIst: this.toIstString(repeatedBooking.scheduledAt),
        createdAt: repeatedBooking.createdAt,
        createdAtIst: this.toIstString(repeatedBooking.createdAt),
        updatedAt: repeatedBooking.updatedAt,
        updatedAtIst: this.toIstString(repeatedBooking.updatedAt),
        status: repeatedBooking.status,
        paymentStatus: repeatedBooking.paymentStatus,
        assignmentType: repeatedBooking.assignmentType,
        serviceId: repeatedBooking.serviceId,
        customerAddressId: repeatedBooking.customerAddressId ?? null,
        finalAmount: Number(repeatedBooking.finalAmount),
        eligiblePurohitCount: repeatedBooking.filteredPurohitIds?.length ?? 0,
      },
    };
  }

  async createBookingByAdmin(
    adminUser: User,
    dto: CreateBookingByAdminDto,
  ): Promise<CreateBookingByAdminResponse> {
    // TODO: Previous manual assignment implementation when purohitId was required in admin booking creation:
    // /*
    // if (adminUser.role !== USER_ROLE.ADMIN) {
    //   throw new ForbiddenException('Only admins can create bookings manually');
    // }
    // const scheduledAt = new Date(dto.scheduledAt);
    // if (Number.isNaN(scheduledAt.getTime())) {
    //   throw new BadRequestException('Invalid scheduled date and time');
    // }
    // ... (previous manual assignment logic)
    // */

    if (adminUser.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only admins can create bookings manually');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time');
    }

    try {
      const transactionResult = await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const serviceRepository = manager.getRepository(Service);
        const addressRepository = manager.getRepository(CustomerAddress);
        const bookingRepository = manager.getRepository(Booking);

        const [customer, service, customerAddress] = await Promise.all([
          userRepository.findOne({
            where: { id: dto.customerId, role: USER_ROLE.CUSTOMER },
          }),
          serviceRepository.findOne({
            where: { id: dto.serviceId },
          }),
          addressRepository.findOne({
            where: { id: dto.customerAddressId, customerId: dto.customerId },
          }),
        ]);

        if (!customer) {
          throw new NotFoundException('Customer not found');
        }

        if (!service) {
          throw new NotFoundException('Service not found');
        }

        if (!service.isActive) {
          throw new BadRequestException('Service is currently inactive');
        }

        if (!customerAddress) {
          throw new NotFoundException('Customer address not found');
        }

        const purohitProfileRepository = manager.getRepository(PurohitProfile);
        let assignedPurohitProfile: PurohitProfile | null = null;
        let assignedPurohitUser: User | null = null;

        if (dto.purohitId) {
          assignedPurohitProfile = await purohitProfileRepository
            .createQueryBuilder('purohit')
            .innerJoinAndSelect('purohit.user', 'user')
            .where('purohit.id = :purohitId OR purohit.userId = :purohitId', {
              purohitId: dto.purohitId,
            })
            .getOne();

          if (!assignedPurohitProfile) {
            assignedPurohitProfile = await purohitProfileRepository.findOne({
              where: [{ id: dto.purohitId }, { userId: dto.purohitId }],
              relations: { user: true },
            });
          }

          if (!assignedPurohitProfile) {
            throw new NotFoundException('Purohit not found');
          }

          if (assignedPurohitProfile.user && assignedPurohitProfile.user.role !== USER_ROLE.PUROHIT) {
            throw new BadRequestException('Selected user is not a Purohit');
          }

          if (assignedPurohitProfile.user && assignedPurohitProfile.user.status !== USER_STATUS.ACTIVE) {
            throw new BadRequestException('Purohit account is not active');
          }

          if (
            assignedPurohitProfile.verificationStatus &&
            assignedPurohitProfile.verificationStatus !== PUROHIT_VERIFICATION_STATUS.APPROVED
          ) {
            throw new BadRequestException('Purohit is not approved');
          }

          const purohitServiceRepository = manager.getRepository(PurohitService);
          const matchingPurohitService = await purohitServiceRepository.findOne({
            where: {
              purohitId: assignedPurohitProfile.id,
              serviceId: service.id,
              isActive: true,
            },
          });

          if (!matchingPurohitService) {
            throw new BadRequestException(
              'Selected Purohit does not provide the service required for this booking',
            );
          }

          assignedPurohitUser =
            assignedPurohitProfile.user ??
            (await userRepository.findOne({
              where: { id: assignedPurohitProfile.userId },
            }));
        }

        // Validate Service availability in the booking city
        const bookingCity = customerAddress.city?.trim();
        if (!bookingCity) {
          throw new BadRequestException(
            'Selected customer address does not contain a valid city',
          );
        }

        const serviceCities = Array.isArray(service.cities) ? service.cities : [];
        const normalizedBookingCity = normalizeCityName(bookingCity);
        const isCityAvailable = serviceCities.some(
          (c) => normalizeCityName(c.name) === normalizedBookingCity,
        );

        if (!isCityAvailable) {
          throw new BadRequestException(
            'Selected service is not available in the booking city.',
          );
        }

        // Prevent concurrent duplicate bookings
        const duplicateLockKey = [
          customer.id,
          service.id,
          scheduledAt.toISOString(),
        ].join(':');

        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          duplicateLockKey,
        ]);

        const activeBookingStatuses = [
          BOOKING_STATUS.PENDING,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ENROUTE,
          BOOKING_STATUS.ARRIVED,
          BOOKING_STATUS.ONGOING,
        ];

        const duplicateBookingExists = await bookingRepository
          .createQueryBuilder('booking')
          .where('booking.customerId = :customerId', {
            customerId: customer.id,
          })
          .andWhere('booking.serviceId = :serviceId', {
            serviceId: service.id,
          })
          .andWhere('booking.scheduledAt = :scheduledAt', {
            scheduledAt,
          })
          .andWhere('booking.status IN (:...statuses)', {
            statuses: activeBookingStatuses,
          })
          .getExists();

        if (duplicateBookingExists) {
          throw new ConflictException(
            'An active booking for this service and scheduled time already exists',
          );
        }

        // Plan Validation & Derivation
        const rawPlan = dto.plan as string | undefined;
        if (
          !rawPlan ||
          (rawPlan.toUpperCase() !== 'BASIC' && rawPlan.toUpperCase() !== 'STANDARD')
        ) {
          throw new BadRequestException('A valid plan (BASIC or STANDARD) must be selected');
        }

        if (!service.plans) {
          throw new BadRequestException('Service plans are not configured for this service');
        }

        const normalizedKey = rawPlan.toUpperCase() === 'STANDARD' ? 'standard' : 'basic';
        const planObj =
          (service.plans as any)[normalizedKey] ||
          (service.plans as any)[rawPlan] ||
          (service.plans as any)[rawPlan.toLowerCase()] ||
          (service.plans as any)[rawPlan.toUpperCase()];

        if (!planObj || !Number.isFinite(Number(planObj.price)) || Number(planObj.price) <= 0) {
          throw new BadRequestException(`Price is not configured for the selected ${rawPlan} plan`);
        }

        const bookingPrice = Number(planObj.price);
        const selectedPlan = rawPlan.toUpperCase() === 'STANDARD' ? SERVICE_PLAN.STANDARD : SERVICE_PLAN.BASIC;

        const commissionPercentage = Number(service.commissionPercentage);
        if (
          !Number.isFinite(commissionPercentage) ||
          commissionPercentage < 0 ||
          commissionPercentage > 100
        ) {
          throw new BadRequestException(
            'A valid commission percentage is not configured for this service',
          );
        }

        const donationAmount = Number(dto.donationAmount ?? 0);
        if (!Number.isFinite(donationAmount) || donationAmount < 0) {
          throw new BadRequestException(
            'Donation amount must be zero or greater',
          );
        }

        let appliedCoupon: Coupon | null = null;
        let discountAmount = 0;

        if (dto.couponCode) {
          const couponResult = await this.validateAndCalculateCoupon(
            manager,
            customer.id,
            service.id,
            dto.couponCode.trim().toUpperCase(),
            bookingPrice,
          );
          appliedCoupon = couponResult.coupon;
          discountAmount = couponResult.discountAmount;
        }

        const purohitBasePrice =
          service.plans?.basic?.price != null && Number(service.plans.basic.price) > 0
            ? Number(service.plans.basic.price)
            : bookingPrice;

        const platformCommission = Number(
          (purohitBasePrice * (commissionPercentage / 100)).toFixed(2),
        );
        const purohitPayoutAmount = Number(
          (purohitBasePrice - platformCommission).toFixed(2),
        );

        const finalAmount = Number(
          (bookingPrice - discountAmount + donationAmount).toFixed(2),
        );

        // TOKEN PAYMENT BYPASS FOR ADMIN-CREATED BOOKINGS:
        // No token payment required, no Razorpay URL created.
        const tokenPercentage = null;
        const tokenAmount = null;
        const paidAmount = 0.0;
        const remainingAmount = finalAmount;

        const bookingNumber =
          await this.generateUniqueBookingNumber(bookingRepository);

        const booking = bookingRepository.create({
          bookingNumber,
          customerId: customer.id,
          serviceId: service.id,
          customerAddressId: customerAddress.id,
          addressSnapshot: this.createAddressSnapshot(customerAddress),
          customerPincode: customerAddress.pincode?.trim() || '',
          bookingMode: dto.bookingMode as BOOKING_MODE,
          scheduledAt,
          specialInstructions: dto.specialInstructions?.trim() || undefined,
          customFields: {
            ...(dto.customFields || {}),
            createdByAdmin: true,
          },
          commissionPercentage,
          plan: selectedPlan,
          servicePrice: bookingPrice,
          platformCommission,
          purohitPayoutAmount,
          couponCode: appliedCoupon?.code ?? undefined,
          discountAmount,
          donationAmount,
          finalAmount,
          tokenPercentage,
          tokenAmount,
          paidAmount,
          remainingAmount,
          // TODO: Deprecated. Admin-created bookings previously always required manual assignment and NOT_REQUIRED status:
          // status: BOOKING_STATUS.CONFIRMED,
          // paymentStatus: BOOKING_PAYMENT_STATUS.NOT_REQUIRED,
          // assignmentType: ASSIGNMENT_TYPE.MANUAL,
          // purohitId: dto.purohitId,
          status: assignedPurohitProfile ? BOOKING_STATUS.ACCEPTED : BOOKING_STATUS.PENDING,
          paymentType: BOOKING_PAYMENT_TYPE.DEFERRED,
          paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
          assignmentType: assignedPurohitProfile ? ASSIGNMENT_TYPE.MANUAL : ASSIGNMENT_TYPE.AUTO,
          purohitId: assignedPurohitProfile ? assignedPurohitProfile.id : undefined,
          filteredPurohitIds: assignedPurohitProfile ? [assignedPurohitProfile.id] : [],
        });

        let eligiblePurohitUserIds: number[] = [];

        if (!assignedPurohitProfile) {
          // IMMEDIATE ASSIGNMENT ELIGIBILITY (AUTO ASSIGNMENT):
          // Admin-created bookings without a specified Purohit bypass token payment and immediately become eligible for AUTO assignment.
          const eligiblePurohitIds =
            await this.assignmentService.findEligiblePurohitIds(
              manager,
              booking,
            );

          booking.filteredPurohitIds = eligiblePurohitIds;

          if (eligiblePurohitIds.length > 0) {
            const purohitProfiles = await manager
              .getRepository(PurohitProfile)
              .createQueryBuilder('profile')
              .select(['profile.id', 'profile.userId'])
              .where('profile.id IN (:...purohitProfileIds)', {
                purohitProfileIds: eligiblePurohitIds,
              })
              .getMany();

            eligiblePurohitUserIds = purohitProfiles.map(
              (profile) => profile.userId,
            );
          }
        }

        const savedBooking = await bookingRepository.save(booking);

        if (appliedCoupon) {
          const couponUsageRepository = manager.getRepository(CouponUsage);
          await couponUsageRepository.save(
            couponUsageRepository.create({
              coupon: appliedCoupon,
              customer,
              booking: savedBooking,
              discountApplied: discountAmount,
            }),
          );
        }

        await this.auditLogService.createAuditLog(
          {
            actorId: adminUser.id,
            actorType: ACTOR_TYPE.USER,
            actorRole: adminUser.role,
            module: AUDIT_MODULE.BOOKING,
            entity: 'Booking',
            entityId: String(savedBooking.id),
            action: 'BOOKING_CREATED_ADMIN',
            message: `Admin created Booking B-${savedBooking.id} for Customer #${customer.id}.`,
            oldValue: undefined,
            newValue: {
              status: savedBooking.status,
              paymentStatus: savedBooking.paymentStatus,
              plan: savedBooking.plan,
              serviceId: savedBooking.serviceId,
              scheduledAt: savedBooking.scheduledAt,
              purohitId: savedBooking.purohitId,
            },
          },
          manager,
        );

        return {
          savedBooking,
          assignedPurohitUser,
          eligiblePurohitUserIds,
          customer,
          service,
          customerAddress,
        };
      });

      if (transactionResult.assignedPurohitUser) {
        try {
          await this.notificationService.createNotification(
            transactionResult.assignedPurohitUser.id,
            'Booking Assigned',
            `Booking B-${transactionResult.savedBooking.id} assigned to you by admin`,
            NOTIFICATION_TYPE.BOOKING,
            transactionResult.savedBooking.id,
            'BOOKING',
          );
        } catch (err: any) {
          this.logger.warn(
            `Failed to notify assigned Purohit ${transactionResult.assignedPurohitUser.id}: ${err?.message}`,
          );
        }
      } else {
        // Dispatch notifications to eligible Purohits
        for (const purohitUserId of transactionResult.eligiblePurohitUserIds) {
          try {
            await this.notificationService.createNotification(
              purohitUserId,
              'New Booking',
              `You have received a new booking request (Booking B-${transactionResult.savedBooking.id}).`,
              NOTIFICATION_TYPE.BOOKING,
              transactionResult.savedBooking.id,
              'BOOKING',
            );
          } catch (err: any) {
            this.logger.warn(`Failed to notify Purohit ${purohitUserId}: ${err?.message}`);
          }
        }
      }

      // Notify customer
      try {
        await this.notificationService.createNotification(
          transactionResult.customer.id,
          'Booking Created',
          `Booking B-${transactionResult.savedBooking.id} created by admin for you`,
          NOTIFICATION_TYPE.BOOKING,
          transactionResult.savedBooking.id,
          'BOOKING',
        );
      } catch (err: any) {
        this.logger.warn(`Failed to notify customer: ${err?.message}`);
      }

      // Email notifications
      const {
        savedBooking: b,
        assignedPurohitUser,
        customer,
        service,
        customerAddress,
      } = transactionResult;

      const customerName = customer.firstName || 'Customer';
      const addressString = `${customerAddress.fullAddress}, ${customerAddress.city} - ${customerAddress.pincode}`;
      const scheduledDateStr = b.scheduledAt
        ? new Date(b.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : 'Scheduled Date';
      const splitDate = scheduledDateStr.split(', ');
      const bookingDate = splitDate[0] || 'Scheduled Date';
      const bookingTime = splitDate[1] || 'Scheduled Time';

      const purohitName = assignedPurohitUser
        ? (assignedPurohitUser.firstName
            ? `${assignedPurohitUser.firstName} ${assignedPurohitUser.lastName || ''}`.trim()
            : 'Purohit')
        : 'To be assigned';

      if (customer.email) {
        try {
          this.logger.log(`[BookingEmail] Sending booking confirmation email to customer for booking B-${b.id}...`);
          await this.emailService.sendCustomerBookingConfirmationEmail({
            email: customer.email,
            customerName,
            bookingId: b.bookingNumber,
            serviceName: service.name,
            servicePlan: b.plan ? String(b.plan) : undefined,
            planName: b.plan ? String(b.plan) : undefined,
            bookingDate,
            bookingTime,
            bookingAddress: addressString,
            purohitName,
            totalAmount: Number(b.finalAmount) || 0,
            amountPaid: 0,
            pendingAmount: Number(b.finalAmount) || 0,
            paymentStatus: b.paymentStatus,
            bookingStatus: b.status,
            specialInstructions: b.specialInstructions,
          });
          this.logger.log(`[BookingEmail] Customer booking email sent successfully for booking B-${b.id}.`);
        } catch (error) {
          this.logger.error(`[BookingEmail] Failed to send customer booking email for booking B-${b.id}`, error instanceof Error ? error.stack : String(error));
        }
      }

      if (assignedPurohitUser && assignedPurohitUser.email && this.emailService) {
        try {
          this.logger.log(
            `[BookingEmail] Sending booking assignment email to Purohit for booking B-${b.id}...`,
          );
          await this.emailService.sendPurohitBookingAssignmentEmail({
            email: assignedPurohitUser.email,
            purohitName,
            bookingId: b.bookingNumber,
            customerName,
            customerPhone: customer.phone || 'N/A',
            serviceName: service.name,
            servicePlan: b.plan ? String(b.plan) : undefined,
            planName: b.plan ? String(b.plan) : undefined,
            bookingDate,
            bookingTime,
            bookingAddress: addressString,
            totalAmount: Number(b.finalAmount) || 0,
            purohitPayoutAmount: Number(b.purohitPayoutAmount) || 0,
            paymentStatus: b.paymentStatus,
            bookingStatus: b.status,
            specialInstructions: b.specialInstructions,
          });
          this.logger.log(
            `[BookingEmail] Purohit booking email sent successfully for booking B-${b.id}.`,
          );
        } catch (error) {
          this.logger.error(
            `[BookingEmail] Failed to send Purohit booking email for booking B-${b.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }

      // TODO: Deprecated returning entire booking entity.
      // Now returns refined CreateBookingByAdminResponse structure without internal fields.
      // return transactionResult.formattedSavedBooking as any;

      const responseData: CreateBookingByAdminResponse = {
        bookingId: transactionResult.savedBooking.id,
        bookingNumber: transactionResult.savedBooking.bookingNumber,
        plan: transactionResult.savedBooking.plan ?? null,
        status: transactionResult.savedBooking.status,
        paymentType: transactionResult.savedBooking.paymentType ?? BOOKING_PAYMENT_TYPE.DEFERRED,
        paymentStatus: transactionResult.savedBooking.paymentStatus,
        paymentId: null,
        paymentUrl: null,
        purohitId: transactionResult.savedBooking.purohitId ?? null,
      };

      return responseData;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          'An active booking for this service and scheduled time already exists',
        );
      }
      throw error;
    }
  }
}
