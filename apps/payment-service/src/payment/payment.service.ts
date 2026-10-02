import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';
import { DataSource, EntityManager, FindOptionsWhere, In } from 'typeorm';

import {
  Booking,
  BOOKING_PAYMENT_STATUS,
  BOOKING_STATUS,
  BookingProduct,
  Cart,
  CartItem,
  PaymentBooking,
  Payment,
  CUSTOMER_PAYMENT_METHOD,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  Order,
  ORDER_STATUS,
  ORDER_PAYMENT_STATUS,
  ORDER_PAYMENT_METHOD,
  ShippingAddressSnapshot,
  User,
  USER_ROLE,
  BANK_VERIFICATION_STATUS,
} from '@poojawala/entities';

import { BookingRepository, PaymentRepository } from '@poojawala/repositories';

import {
  CreatePaymentLinkDto,
  PaymentQueryDto,
  AdminPaymentQueryDto,
  CreateRefundDto,
  AdminCreatePurohitPayoutDto,
} from '@poojawala/dtos';

import {
  paymentInvoiceTemplate,
  InvoiceOrderItem,
} from './templates/invoice.template';
import { NotificationService } from '@poojawala/notification';
import {
  NOTIFICATION_TYPE,
  PurohitProfile,
  PurohitBankAccount,
  ASSIGNMENT_TYPE,
  BOOKING_PAYMENT_TYPE,
} from '@poojawala/entities';
import { BookingGateway } from '@poojawala/gateway';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { EmailService, renderPoojawalaEmail } from '@poojawala/email-services';
import { AssignmentService } from '../../../user-service/src/assignment/assignment.service';

interface RazorpayError {
  error?: {
    description?: string;
  };

  message?: string;
}

export interface PaymentLinkCustomer {
  name: string;
  email?: string;
  contact?: string;
}

export interface RazorpayPaymentLinkData {
  id: string;
  entity?: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  description?: string;
  status?: string;
  reference_id?: string;
  short_url: string;
  callback_url?: string;
  created_at?: number;

  notes?: {
    paymentId?: string;
    bookingId?: string;
    bookingNumber?: string;
  };
}

export interface RazorpayPaymentData {
  id?: string;
  entity?: string;
  amount?: number;
  currency?: string;
  status?: string;
  order_id?: string | null;
  invoice_id?: string | null;
  international?: boolean;
  method?: string;
  amount_refunded?: number;
  refund_status?: string | null;
  captured?: boolean;
  description?: string | null;
  card_id?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  email?: string | null;
  contact?: string | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_reason?: string | null;
  acquirer_data?: Record<string, unknown>;

  notes?: {
    paymentId?: string;
    bookingId?: string;
    bookingNumber?: string;
    [key: string]: unknown;
  };

  created_at?: number;
}

interface RazorpayPaymentCollection {
  entity?: string;
  count?: number;
  items?: RazorpayPaymentData[];
}

interface RazorpayRefundData {
  id: string;
  entity?: string;
  amount: number;
  currency?: string;
  payment_id: string;
  status?: string;
  speed_processed?: string;
  speed_requested?: string;
  receipt?: string | null;
  created_at?: number;

  notes?: {
    originalPaymentId?: string;
    refundPaymentId?: string;
    bookingId?: string;
    reason?: string;
  };
}

export interface PaymentProviderDetails {
  entity: string | null;
  international: boolean | null;
  captured: boolean | null;
  description: string | null;
  email: string | null;
  contact: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  cardId: string | null;
  invoiceId: string | null;
  fee: number | null;
  tax: number | null;
  amountRefunded: number | null;
  refundStatus: string | null;
  errorCode: string | null;
  errorSource: string | null;
  errorStep: string | null;
  errorReason: string | null;
  acquirerData: Record<string, unknown> | null;
  providerCreatedAt: Date | null;
}

export interface PaymentDetailsResponse {
  // TODO: Deprecated.
  // Synthetic pending Purohit payouts do not represent an actual payment transaction,
  // so id and paymentId must be nullable.
  // id: number;
  id: number | null;
  paymentId?: string | number | null;
  customer?: string | null;
  // TODO: Old paymentType definition
  // paymentType: PAYMENT_TYPE;
  paymentType: PAYMENT_TYPE | string;
  bookingId: number | null;
  orderId: number | null;
  orderNumber: string | null;
  bookingPaymentStatus: BOOKING_PAYMENT_STATUS | null;
  purohitPayoutStatus: BOOKING_PAYMENT_STATUS | null;
  purohitPayoutAmount: number | null;

  customerDetails: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    profileImage: string | null;
  } | null;

  linkedBookings: Array<{
    id: number;
    bookingNumber?: string;
  }>;

  linkedOrder: {
    id: number;
    orderNumber?: string;
  } | null;

  createdById: number;
  payerId: number | null;
  payeeId: number | null;

  amount: number;
  customerPaidAmount?: number | null;
  currency: string;

  status: PAYMENT_STATUS;
  providerStatus: string | null;
  customerPaymentMethod?: CUSTOMER_PAYMENT_METHOD | null;
  // TODO: Old paymentMethod definition
  // paymentMethod: PAYMENT_METHOD | null;
  paymentMethod: PAYMENT_METHOD | string | null;

  razorpayOrderId: string | null;
  razorpayPaymentLinkId: string | null;
  razorpayPaymentId: string | null;
  razorpayRefundId: string | null;
  razorpayFee?: number | null;
  razorpayTax?: number | null;

  bankTransferReference: string | null;
  failureReason: string | null;

  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  providerDetails: PaymentProviderDetails | null;

  source: 'RAZORPAY_WITH_DB_FALLBACK' | 'DATABASE_ONLY';

  razorpay?: {
    paymentId: string | null;
    paymentLinkId: string | null;
    customerPaidAmount: number | null;
    fee: number | null;
    tax: number | null;
  } | null;
}

export interface BookingPaymentLinkResponse {
  paymentId: number;
  paymentUrl: string;

  amount: number;
  amountInPaise: number;
  currency: string;

  bookingId: number;
  bookingNumber: string;

  status: PAYMENT_STATUS;
  customerPaymentMethod?: CUSTOMER_PAYMENT_METHOD;
  paymentMethod?: PAYMENT_METHOD;
  razorpayOrderId?: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentId?: string;
}

export interface RazorpayWebhookPaymentEntity {
  id: string;
  order_id?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  method?: string;
  fee?: number;
  tax?: number;
  error_description?: string | null;
  created_at?: number;

  notes?: {
    paymentId?: string;
    bookingId?: string;
    bookingNumber?: string;
    [key: string]: unknown;
  };
}

export interface RazorpayWebhookPaymentLinkEntity {
  id: string;
  entity?: string;
  status?: string;
  amount?: number;
  amount_paid?: number;
  currency?: string;
  reference_id?: string;
  short_url?: string;
  created_at?: number;

  notes?: {
    paymentId?: string;
    bookingId?: string;
    bookingNumber?: string;
  };
}

export interface RazorpayWebhookRefundEntity {
  id: string;
  payment_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  speed_processed?: string;
  speed_requested?: string;
  receipt?: string | null;
  created_at?: number;

  notes?: {
    originalPaymentId?: string;
    refundPaymentId?: string;
    bookingId?: string;
    reason?: string;
  };

  error_code?: string | null;
  error_description?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_reason?: string | null;
}

export interface RazorpayWebhookPayload {
  event: string;

  payload?: {
    payment?: {
      entity?: RazorpayWebhookPaymentEntity;
    };

    payment_link?: {
      entity?: RazorpayWebhookPaymentLinkEntity;
    };

    refund?: {
      entity?: RazorpayWebhookRefundEntity;
    };
  };
}

export interface PaginatedPaymentsResponse {
  items: PaymentDetailsResponse[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  private _cachedRazorpay: Razorpay | null = null;
  private _cachedRazorpayKeyId: string | null = null;
  private _cachedRazorpayKeySecret: string | null = null;

  // TODO: Replaced unmemoized getter that called dotenv.config() and instantiated new Razorpay on every property access
  // private get razorpay(): Razorpay {
  //   try {
  //     require('dotenv').config({ override: true });
  //   } catch { }
  //
  //   const keyId =
  //     this.configService?.get<string>('RAZORPAY_KEY_ID')?.trim() ||
  //     process.env['RAZORPAY_KEY_ID']?.trim();
  //   const keySecret =
  //     this.configService?.get<string>('RAZORPAY_KEY_SECRET')?.trim() ||
  //     process.env['RAZORPAY_KEY_SECRET']?.trim();
  //
  //   if (!keyId || !keySecret) {
  //     throw new Error('Razorpay credentials are not configured');
  //   }
  //
  //   return new Razorpay({
  //     key_id: keyId,
  //     key_secret: keySecret,
  //   });
  // }
  private get razorpay(): Razorpay {
    const keyId =
      this.configService?.get<string>('RAZORPAY_KEY_ID')?.trim() ||
      process.env['RAZORPAY_KEY_ID']?.trim();
    const keySecret =
      this.configService?.get<string>('RAZORPAY_KEY_SECRET')?.trim() ||
      process.env['RAZORPAY_KEY_SECRET']?.trim();

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials are not configured');
    }

    if (
      this._cachedRazorpay &&
      this._cachedRazorpayKeyId === keyId &&
      this._cachedRazorpayKeySecret === keySecret
    ) {
      return this._cachedRazorpay;
    }

    this._cachedRazorpayKeyId = keyId;
    this._cachedRazorpayKeySecret = keySecret;
    this._cachedRazorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    return this._cachedRazorpay;
  }

  private formatRazorpayError(error: unknown): string {
    if (!error) {
      return 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      const parts: string[] = [];

      const statusCode = errObj['statusCode'] ?? errObj['status'];
      if (statusCode) {
        parts.push(`status: ${statusCode}`);
      }

      const nestedError =
        errObj['error'] && typeof errObj['error'] === 'object'
          ? (errObj['error'] as Record<string, unknown>)
          : null;

      const code = nestedError?.['code'] ?? errObj['code'];
      if (code) {
        parts.push(`code: ${code}`);
      }

      const description =
        nestedError?.['description'] ??
        errObj['description'] ??
        (error instanceof Error ? error.message : errObj['message']);
      if (description) {
        parts.push(`description: ${description}`);
      }

      if (parts.length > 0) {
        return parts.join(', ');
      }

      if (error instanceof Error) {
        return error.message;
      }

      try {
        const sanitized = { ...errObj };
        delete sanitized['key_secret'];
        delete sanitized['key_id'];
        delete sanitized['auth'];
        delete sanitized['headers'];
        delete sanitized['authorization'];
        return JSON.stringify(sanitized);
      } catch {
        return 'Unserializable error';
      }
    }

    return String(error);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly bookingGateway: BookingGateway,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly assignmentService?: AssignmentService,
  ) { }

  async getPurohitPayoutDetails(bookingId: number) {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['purohit', 'purohit.user'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException('Booking is not completed yet');
    }

    if (booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID) {
      throw new BadRequestException('Booking payment is not completed yet');
    }

    if (!booking.purohitId || !booking.purohit) {
      throw new BadRequestException('No Purohit is assigned to this booking');
    }

    const purohitBankAccountRepository =
      this.dataSource.getRepository(PurohitBankAccount);
    const bankAccount = await purohitBankAccountRepository.findOne({
      where: { purohitId: booking.purohitId, isPrimary: true },
    });

    if (!bankAccount) {
      throw new NotFoundException('Purohit bank account not found');
    }

    if (bankAccount.verificationStatus !== BANK_VERIFICATION_STATUS.VERIFIED) {
      throw new BadRequestException('Purohit bank account is not verified');
    }

    const payoutAmount = Number(booking.purohitPayoutAmount);

    // Mask account number
    const maskedAccountNumber = bankAccount.accountNumber
      ? 'X'.repeat(Math.max(0, bankAccount.accountNumber.length - 4)) +
      bankAccount.accountNumber.slice(-4)
      : null;

    return {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      purohitId: booking.purohitId,
      purohitName: booking.purohit.user
        ? `${booking.purohit.user.firstName} ${booking.purohit.user.lastName}`
        : 'Unknown',
      payoutAmount,
      bookingStatus: booking.status,
      bookingPaymentStatus: booking.paymentStatus,
      payoutStatus: booking.purohitPayoutStatus,
      bankAccount: {
        id: bankAccount.id,
        paymentMethod: bankAccount.paymentMethod,
        accountHolderName: bankAccount.accountHolderName,
        bankName: bankAccount.bankName,
        accountNumber: maskedAccountNumber,
        ifscCode: bankAccount.ifscCode,
        upiId: bankAccount.upiId,
        verificationStatus: bankAccount.verificationStatus,
      },
    };
  }

  async adminRecordPurohitPayout(
    adminId: number,
    dto: AdminCreatePurohitPayoutDto,
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id: dto.bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException('Booking is not completed yet');
    }

    if (booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID) {
      throw new BadRequestException('Booking payment is not completed yet');
    }

    if (!booking.purohitId) {
      throw new BadRequestException('No Purohit is assigned to this booking');
    }

    const purohitProfile = await this.dataSource
      .getRepository(PurohitProfile)
      .findOne({
        where: { id: booking.purohitId },
      });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const purohitBankAccountRepository =
      this.dataSource.getRepository(PurohitBankAccount);
    const bankAccount = await purohitBankAccountRepository.findOne({
      where: { purohitId: booking.purohitId, isPrimary: true },
    });

    if (!bankAccount) {
      throw new NotFoundException('Primary Purohit bank account not found');
    }

    if (bankAccount.verificationStatus !== BANK_VERIFICATION_STATUS.VERIFIED) {
      throw new BadRequestException('Purohit bank account is not verified');
    }

    const payoutAmount = Number(booking.purohitPayoutAmount);

    if (payoutAmount <= 0) {
      throw new BadRequestException('Payout amount must be greater than zero');
    }

    // TODO: Deprecated.
    // Relied solely on post-query payment records without checking booking-level
    // purohitPayoutStatus and purohitPaymentId or pessimistic lock.
    // const existingPayouts = await this.paymentRepository.find({
    //   where: {
    //     bookingId: booking.id,
    //     paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT,
    //   },
    // });
    //
    // for (const ep of existingPayouts) {
    //   if (ep.status === PAYMENT_STATUS.SUCCESS) {
    //     throw new BadRequestException(
    //       'Payout has already been completed for this booking',
    //     );
    //   }
    // }

    // TODO: Deprecated check on booking.purohitPaymentId != null.
    // Now that a real PUROHIT_PAYOUT payment record is created in PENDING status
    // when the customer fully pays, booking.purohitPaymentId points to that pending payout ID.
    // Admin payout must update that SAME record to PAID rather than rejecting.
    // if (
    //   booking.purohitPayoutStatus === BOOKING_PAYMENT_STATUS.PAID ||
    //   booking.purohitPaymentId != null
    // ) {
    //   throw new BadRequestException(
    //     'Payout has already been completed for this booking',
    //   );
    // }
    if (booking.purohitPayoutStatus === BOOKING_PAYMENT_STATUS.PAID) {
      throw new BadRequestException(
        'Payout has already been completed for this booking',
      );
    }

    const existingPayouts = await this.paymentRepository.find({
      where: {
        bookingId: booking.id,
        paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT,
      },
    });

    for (const ep of existingPayouts) {
      if (ep.status === PAYMENT_STATUS.SUCCESS) {
        throw new BadRequestException(
          'Payout has already been completed for this booking',
        );
      }
    }

    const idempotencyKey = crypto.randomUUID();

    // Check duplicate Idempotency Key (unlikely with UUID but good practice)
    const duplicatePayment = await this.paymentRepository.findOne({
      where: { idempotencyKey, status: PAYMENT_STATUS.SUCCESS },
    });

    if (duplicatePayment) {
      throw new BadRequestException('Duplicate idempotency key detected');
    }

    // Wrap in transaction
    const savedPayout = await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const bkRepo = manager.getRepository(Booking);

      // Lock booking row to prevent concurrent duplicate payouts
      const lockedBooking = await bkRepo.findOne({
        where: { id: booking.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !lockedBooking ||
        lockedBooking.purohitPayoutStatus === BOOKING_PAYMENT_STATUS.PAID
      ) {
        throw new BadRequestException(
          'Payout has already been completed for this booking',
        );
      }

      // Find the existing PUROHIT_PAYOUT payment record for this booking
      let payoutRecord = await paymentRepo.findOne({
        where: [
          ...(lockedBooking.purohitPaymentId
            ? [{ id: lockedBooking.purohitPaymentId, paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT }]
            : []),
          {
            bookingId: booking.id,
            paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT,
          },
        ],
      });

      if (payoutRecord && payoutRecord.status === PAYMENT_STATUS.SUCCESS) {
        throw new BadRequestException(
          'Payout has already been completed for this booking',
        );
      }

      const payoutMethod =
        bankAccount.paymentMethod === 'UPI'
          ? PAYMENT_METHOD.UPI
          : PAYMENT_METHOD.BANK_TRANSFER;

      if (payoutRecord) {
        // Update the SAME Payment record: PENDING -> SUCCESS (PAID)
        payoutRecord.status = PAYMENT_STATUS.SUCCESS;
        payoutRecord.paidAt = new Date();
        payoutRecord.payerId = adminId;
        payoutRecord.payeeId = payoutRecord.payeeId || purohitProfile.userId;
        payoutRecord.paymentMethod = payoutMethod;
        payoutRecord.purohitBankAccountId = bankAccount.id;
        payoutRecord.idempotencyKey = idempotencyKey;
        if (dto.remark) {
          payoutRecord.remark = dto.remark;
        }
        payoutRecord = await paymentRepo.save(payoutRecord);
      } else {
        // Fallback: create if none existed yet
        // TODO: Deprecated new payout creation when one should already exist.
        // Preserved as fallback for legacy bookings.
        payoutRecord = paymentRepo.create({
          paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT,
          bookingId: booking.id,
          createdById: adminId,
          payerId: adminId,
          payeeId: purohitProfile.userId,
          amount: payoutAmount,
          currency: 'INR',
          paymentMethod: payoutMethod,
          idempotencyKey,
          purohitBankAccountId: bankAccount.id,
          status: PAYMENT_STATUS.SUCCESS,
          remark: dto.remark,
          paidAt: new Date(),
        });
        payoutRecord = await paymentRepo.save(payoutRecord);
      }

      lockedBooking.purohitPayoutStatus = BOOKING_PAYMENT_STATUS.PAID;
      lockedBooking.purohitPaymentId = payoutRecord.id;
      await bkRepo.save(lockedBooking);

      booking.purohitPayoutStatus = BOOKING_PAYMENT_STATUS.PAID;
      booking.purohitPaymentId = payoutRecord.id;

      await this.auditLogService.createAuditLog(
        {
          actorId: adminId,
          actorType: ACTOR_TYPE.USER,
          actorRole: USER_ROLE.ADMIN,
          module: AUDIT_MODULE.PAYMENT,
          entity: 'Payment',
          entityId: String(payoutRecord.id),
          action: 'PAYOUT_PROCESSED',
          message: `Admin manually processed a payout of ₹${payoutAmount} for Purohit #${purohitProfile.userId} (Booking #${booking.bookingNumber}).`,
          oldValue: { purohitPayoutStatus: BOOKING_PAYMENT_STATUS.PENDING },
          newValue: {
            purohitPayoutStatus: booking.purohitPayoutStatus,
            paymentId: payoutRecord.id,
          },
        },
        manager,
      );

      return payoutRecord;
    });

    // Create Notification
    await this.notificationService.createNotification(
      purohitProfile.userId,
      'Payout Processed',
      `A payout of ₹${payoutAmount} has been processed for Booking B-${booking.id}.`,
      NOTIFICATION_TYPE.PAYOUT,
      savedPayout.id,
      'PAYOUT',
    );

    return {
      payoutId: savedPayout.id,
      bookingId: savedPayout.bookingId,
      purohitId: booking.purohitId,
      purohitBankAccountId: savedPayout.purohitBankAccountId,
      amount: savedPayout.amount,
      status: savedPayout.status,
      paymentMethod: savedPayout.paymentMethod,
    };
  }

  /**
   * Creates a Razorpay-hosted payment URL.
   *
   * Payment Link ID and URL are intentionally not
   * stored in the database.
   */
  async createBookingPaymentLink(
    user: User,
    dto: CreatePaymentLinkDto,
  ): Promise<BookingPaymentLinkResponse> {
    const booking = await this.bookingRepository.findBookingById(dto.bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    this.validatePaymentCreationAccess(user, booking);

    const amount = this.getBookingAmount(booking, dto.paymentOption);

    // Add duplicate active payment check here
    const existingPayment =
      await this.paymentRepository.findActivePaymentByBookingId(booking.id);

    if (existingPayment) {
      if (existingPayment.status === PAYMENT_STATUS.SUCCESS) {
        if (
          booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
          Number(booking.remainingAmount ?? 0) <= 0
        ) {
          throw new ConflictException('This booking is already paid');
        }
      } else if (
        Number(existingPayment.amount) === Number(amount) &&
        existingPayment.razorpayPaymentLinkId
      ) {
        try {
          const paymentLink = await this.razorpay.paymentLink.fetch(
            existingPayment.razorpayPaymentLinkId,
          );

          if (paymentLink && paymentLink.status === 'created') {
            return {
              paymentId: existingPayment.id,
              paymentUrl: paymentLink.short_url,
              amount,
              amountInPaise: Math.round(amount * 100),
              currency: paymentLink.currency ?? 'INR',
              bookingId: booking.id,
              bookingNumber: booking.bookingNumber,
              status: existingPayment.status,
              customerPaymentMethod: existingPayment.customerPaymentMethod,
              paymentMethod: existingPayment.paymentMethod,
              razorpayOrderId: existingPayment.razorpayOrderId ?? undefined,
              razorpayPaymentLinkId:
                existingPayment.razorpayPaymentLinkId ?? undefined,
              razorpayPaymentId: existingPayment.razorpayPaymentId ?? undefined,
            };
          } else {
            // Status is cancelled, expired, paid, or partially_paid
            existingPayment.status = PAYMENT_STATUS.FAILED;
            existingPayment.failureReason =
              'Previous payment link is no longer usable';
            await this.paymentRepository.savePayment(existingPayment);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to verify payment link for payment ${existingPayment.id}: ${error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
          existingPayment.status = PAYMENT_STATUS.FAILED;
          existingPayment.failureReason =
            'Failed to verify previous payment link';
          await this.paymentRepository.savePayment(existingPayment);
        }
      } else {
        existingPayment.status = PAYMENT_STATUS.FAILED;
        existingPayment.failureReason =
          Number(existingPayment.amount) !== Number(amount)
            ? 'Superseded by new payment request with different amount'
            : 'Previous active payment was incomplete';
        await this.paymentRepository.savePayment(existingPayment);
      }
    }

    const remark =
      dto.paymentOption === 'TOKEN'
        ? 'BOOKING_TOKEN_PAYMENT'
        : Number(booking.paidAmount ?? 0) > 0
          ? 'BOOKING_SETTLEMENT'
          : 'BOOKING_FULL_PAYMENT';

    // Create the new payment only after the check passes
    const savedPayment = await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);

      const paymentBookingRepository = manager.getRepository(PaymentBooking);

      const customerPaymentMethod =
        user.role === USER_ROLE.CUSTOMER
          ? CUSTOMER_PAYMENT_METHOD.ONLINE
          : CUSTOMER_PAYMENT_METHOD.CASH;

      const payment = paymentRepository.create({
        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
        bookingId: booking.id,
        createdById: user.id,
        payerId: booking.customerId,
        payeeId: booking.purohit?.userId,
        amount,
        currency: 'INR',
        status: PAYMENT_STATUS.PENDING,
        customerPaymentMethod,
        remark,
      });

      const createdPayment = await paymentRepository.save(payment);

      const paymentBooking = paymentBookingRepository.create({
        paymentId: createdPayment.id,
        bookingId: booking.id,
      });

      await paymentBookingRepository.save(paymentBooking);

      return createdPayment;
    });

    try {
      const customer = this.getPaymentCustomer(user, booking);

      const paymentLink = await this.createRazorpayPaymentLink(
        savedPayment,
        booking,
        customer,
        dto.description,
      );

      return {
        paymentId: savedPayment.id,
        paymentUrl: paymentLink.short_url,
        amount,
        amountInPaise: Math.round(amount * 100),
        currency: paymentLink.currency ?? 'INR',
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        status: savedPayment.status,
        customerPaymentMethod: savedPayment.customerPaymentMethod,
        paymentMethod: savedPayment.paymentMethod,
        razorpayOrderId: savedPayment.razorpayOrderId ?? undefined,
        razorpayPaymentLinkId: savedPayment.razorpayPaymentLinkId ?? undefined,
        razorpayPaymentId: savedPayment.razorpayPaymentId ?? undefined,
      };
    } catch (error) {
      savedPayment.status = PAYMENT_STATUS.FAILED;

      savedPayment.failureReason =
        error instanceof Error
          ? error.message
          : 'Unable to create payment link';

      await this.paymentRepository.savePayment(savedPayment);

      throw error;
    }
  }

  private validatePaymentCreationAccess(user: User, booking: Booking): void {
    const isCustomer = booking.customerId === user.id;
    const isPurohit = booking.purohit?.userId === user.id;

    if (!isCustomer && !isPurohit) {
      throw new ForbiddenException(
        'You cannot create payment for this booking',
      );
    }

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(
        'Payment cannot be created for a cancelled booking',
      );
    }

    if (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID) {
      throw new ConflictException('This booking is already paid');
    }
  }

  private getBookingAmount(
    booking: Booking,
    paymentOption?: 'TOKEN' | 'FULL',
  ): number {
    const finalAmount = Number(booking.finalAmount);

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      throw new BadRequestException('Invalid booking amount');
    }

    const paidAmount = Number(booking.paidAmount ?? 0);
    const effectiveTokenPercentage =
      booking.tokenPercentage != null && Number(booking.tokenPercentage) > 0
        ? Number(booking.tokenPercentage)
        : 30;

    const tokenAmount =
      booking.tokenAmount != null
        ? Number(booking.tokenAmount)
        : Number(((finalAmount * effectiveTokenPercentage) / 100).toFixed(2));

    const remainingAmount = Number((finalAmount - paidAmount).toFixed(2));

    if (
      remainingAmount <= 0 ||
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID
    ) {
      throw new ConflictException('This booking is already fully paid');
    }

    if (paymentOption === 'TOKEN') {
      if (paidAmount >= tokenAmount) {
        throw new ConflictException(
          'Token payment has already been completed for this booking. Please pay the remaining balance.',
        );
      }
      const tokenDue = Number((tokenAmount - paidAmount).toFixed(2));
      if (tokenDue <= 0) {
        throw new ConflictException('Token amount already fulfilled');
      }
      return tokenDue;
    }

    // Default or FULL or SETTLEMENT: charge the remaining balance
    return remainingAmount;
  }

  async settleBookingPayment(
    user: User,
    bookingId: number,
  ): Promise<BookingPaymentLinkResponse> {
    const booking = await this.bookingRepository.findBookingById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (user.role === USER_ROLE.CUSTOMER && booking.customerId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to settle payment for this booking',
      );
    }

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(
        'Settlement is not allowed after booking is completed',
      );
    }

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(
        'Settlement is not allowed for cancelled bookings',
      );
    }

    const finalAmount = Number(booking.finalAmount ?? 0);
    const paidAmount = Number(booking.paidAmount ?? 0);
    const remainingAmount = Number((finalAmount - paidAmount).toFixed(2));

    if (
      remainingAmount <= 0 ||
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID
    ) {
      throw new ConflictException('This booking is already fully settled');
    }

    return this.createBookingPaymentLink(user, {
      bookingId,
      description: `Settlement payment for Booking #${booking.bookingNumber}`,
      paymentOption: 'FULL',
    });
  }

  private getPaymentCustomer(
    user: User,
    booking: Booking,
  ): PaymentLinkCustomer {
    const name = [booking.customer?.firstName, booking.customer?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const email = booking.customer?.email ?? user.email ?? undefined;

    const contact = booking.customer?.phone ?? user.phone ?? undefined;

    return {
      name: name || user.username || 'Customer',

      ...(email
        ? {
          email: email.trim(),
        }
        : {}),

      ...(contact
        ? {
          contact: contact.trim(),
        }
        : {}),
    };
  }

  public async createRazorpayPaymentLink(
    payment: Payment,
    booking: Booking | null | undefined,
    customer: PaymentLinkCustomer,
    description?: string,
    extraNotes?: Record<string, string>,
    customCallbackUrl?: string,
  ): Promise<RazorpayPaymentLinkData> {
    const amountInPaise = Math.round(Number(payment.amount) * 100);

    const baseFrontendUrl =
      this.configService?.get<string>('FRONTEND_PAYMENT_CALLBACK_URL')?.trim() ||
      process.env['FRONTEND_PAYMENT_CALLBACK_URL']?.trim() ||
      'http://localhost:3000';

    const cleanBase = baseFrontendUrl.replace(/\/+$/, '');

    let callbackUrl: string | undefined;

    if (customCallbackUrl?.trim()) {
      callbackUrl = customCallbackUrl.trim();
    } else if (
      payment.paymentType === PAYMENT_TYPE.PRODUCT_PAYMENT ||
      extraNotes?.['isCartCheckout'] === 'true'
    ) {
      callbackUrl = `${cleanBase}/customer/orders`;
    } else if (
      payment.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT ||
      booking != null
    ) {
      callbackUrl = `${cleanBase}/customer/bookings`;
    } else if (cleanBase) {
      callbackUrl = cleanBase;
    }

    const notify: {
      sms: boolean;
      email: boolean;
    } = {
      sms: Boolean(customer.contact),
      email: Boolean(customer.email),
    };

    try {
      const paymentLink = await this.razorpay.paymentLink.create({
        amount: amountInPaise,

        currency: 'INR',

        accept_partial: false,

        description:
          description?.trim() ||
          (booking
            ? `Payment for booking ${booking.bookingNumber}`
            : `Poojawala Product Purchase #${payment.id}`),

        customer: {
          name: customer.name,

          ...(customer.email
            ? {
              email: customer.email,
            }
            : {}),

          ...(customer.contact
            ? {
              contact: customer.contact,
            }
            : {}),
        },

        notify,

        reminder_enable: true,

        /*
         * This identifies the local DB payment row
         * without storing paymentLinkId.
         */
        reference_id: `payment_${payment.id}`,

        notes: {
          paymentId: String(payment.id),

          bookingId: String(booking?.id ?? ''),

          bookingNumber: booking?.bookingNumber ?? '',

          customerId: String(payment.payerId ?? ''),

          ...(extraNotes || {}),
        },

        ...(callbackUrl
          ? {
            callback_url: callbackUrl,

            callback_method: 'get' as const,
          }
          : {}),
      } as unknown as Parameters<Razorpay['paymentLink']['create']>[0]);

      if (!paymentLink.id || !paymentLink.short_url) {
        throw new InternalServerErrorException(
          'Invalid payment-link response received from Razorpay',
        );
      }

      payment.razorpayPaymentLinkId = paymentLink.id;
      await this.paymentRepository.savePayment(payment);

      return paymentLink as unknown as RazorpayPaymentLinkData;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      const razorpayError = error as RazorpayError;

      const message =
        razorpayError.error?.description ||
        razorpayError.message ||
        'Razorpay payment-link creation failed';

      this.logger.error(
        `Payment-link creation failed for payment ${payment.id}`,
        message,
      );

      throw new BadRequestException(message);
    }
  }

  verifyWebhook(rawBody: Buffer | string, signature: string): boolean {
    const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'];

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Razorpay webhook secret is not configured',
      );
    }

    if (!signature) {
      throw new BadRequestException('Razorpay webhook signature is required');
    }

    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    const receivedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  async processRazorpayWebhook(webhook: RazorpayWebhookPayload): Promise<void> {
    if (!webhook?.event) {
      throw new BadRequestException('Razorpay webhook event is required');
    }

    switch (webhook.event) {
      case 'payment_link.paid':
        await this.handlePaymentLinkPaid(
          webhook.payload?.payment_link?.entity,
          webhook.payload?.payment?.entity,
        );
        return;

      case 'payment_link.cancelled':
      case 'payment_link.expired':
        await this.handlePaymentLinkUnavailable(
          webhook.payload?.payment_link?.entity,
          webhook.event,
        );
        return;

      case 'payment.captured':
        await this.handlePaymentCaptured(webhook.payload?.payment?.entity);
        return;

      case 'payment.failed':
        await this.handlePaymentFailed(webhook.payload?.payment?.entity);
        return;

      case 'refund.created':
        await this.handleRefundCreated(webhook.payload?.refund?.entity);
        return;

      case 'refund.processed':
        await this.handleRefundProcessed(webhook.payload?.refund?.entity);
        return;

      case 'refund.failed':
        await this.handleRefundFailed(webhook.payload?.refund?.entity);
        return;

      default:
        this.logger.log(`Unhandled Razorpay webhook event: ${webhook.event}`);
    }
  }

  private async handlePaymentLinkPaid(
    paymentLink: RazorpayWebhookPaymentLinkEntity | undefined,

    razorpayPayment: RazorpayWebhookPaymentEntity | undefined,
  ): Promise<void> {
    const databasePaymentId = this.resolveDatabasePaymentId(
      paymentLink?.reference_id,
      paymentLink?.notes?.paymentId,
      razorpayPayment?.notes?.paymentId,
    );

    if (!databasePaymentId) {
      this.logger.warn(
        'Unable to resolve database payment ID from payment_link.paid webhook',
      );

      return;
    }

    const payment =
      await this.paymentRepository.findPaymentById(databasePaymentId);

    if (!payment) {
      this.logger.warn(`Payment ${databasePaymentId} not found`);

      return;
    }

    /*
     * Razorpay can retry webhooks.
     */
    if (
      payment.status === PAYMENT_STATUS.SUCCESS &&
      (!razorpayPayment?.id || payment.razorpayPaymentId === razorpayPayment.id)
    ) {
      await this.populateRazorpayMetadata(payment, razorpayPayment, paymentLink);
      await this.paymentRepository.savePayment(payment);
      this.logger.log(
        `Duplicate payment_link.paid webhook ignored for payment ${payment.id}`,
      );

      return;
    }

    payment.status = PAYMENT_STATUS.SUCCESS;

    if (razorpayPayment?.id) {
      payment.razorpayPaymentId = razorpayPayment.id;
    }

    if (razorpayPayment?.order_id) {
      payment.razorpayOrderId = razorpayPayment.order_id;
    }

    payment.paymentMethod = this.mapRazorpayMethod(
      razorpayPayment?.method,
      payment.paymentMethod,
    );

    payment.failureReason = undefined;

    payment.paidAt = razorpayPayment?.created_at
      ? new Date(razorpayPayment.created_at * 1000)
      : new Date();

    await this.populateRazorpayMetadata(payment, razorpayPayment, paymentLink);

    await this.finalizeSuccessfulPayment(payment);

    await this.auditLogService.createAuditLog({
      actorId: null,
      actorType: ACTOR_TYPE.WEBHOOK,
      actorRole: undefined,
      module: AUDIT_MODULE.PAYMENT,
      entity: 'Payment',
      entityId: String(payment.id),
      action: 'PAYMENT_SUCCESS',
      message: `Payment #${payment.id} completed successfully via Razorpay Webhook.`,
      oldValue: { status: PAYMENT_STATUS.PENDING },
      newValue: {
        status: PAYMENT_STATUS.SUCCESS,
        razorpayPaymentId: payment.razorpayPaymentId,
      },
    });

    this.logger.log(
      `Payment ${payment.id} completed through Razorpay Payment Link`,
    );
  }

  private async handlePaymentLinkUnavailable(
    paymentLink: RazorpayWebhookPaymentLinkEntity | undefined,

    event: string,
  ): Promise<void> {
    const databasePaymentId = this.resolveDatabasePaymentId(
      paymentLink?.reference_id,
      paymentLink?.notes?.paymentId,
    );

    if (!databasePaymentId) {
      this.logger.warn(`Unable to resolve payment for ${event}`);

      return;
    }

    const payment =
      await this.paymentRepository.findPaymentById(databasePaymentId);

    if (!payment) {
      return;
    }

    /*
     * Never downgrade a completed payment.
     */
    if (payment.status === PAYMENT_STATUS.SUCCESS) {
      return;
    }

    payment.status = PAYMENT_STATUS.FAILED;

    payment.failureReason =
      event === 'payment_link.expired'
        ? 'Payment link expired'
        : 'Payment link cancelled';

    await this.paymentRepository.savePayment(payment);

    if (payment.paymentType === PAYMENT_TYPE.PRODUCT_PAYMENT) {
      const orderRepo = this.dataSource.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { paymentId: payment.id },
      });
      if (order && order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID) {
        order.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
        await orderRepo.save(order);
      }
    }

    await this.auditLogService.createAuditLog({
      actorId: null,
      actorType: ACTOR_TYPE.SYSTEM,
      actorRole: undefined,
      module: AUDIT_MODULE.PAYMENT,
      entity: 'Payment',
      entityId: String(payment.id),
      action: 'PAYMENT_FAILED',
      message: `Payment #${payment.id} failed: ${payment.failureReason}.`,
      oldValue: { status: PAYMENT_STATUS.PENDING },
      newValue: {
        status: payment.status,
        failureReason: payment.failureReason,
      },
    });

    await this.notifyAndEmailProductPaymentFailure(payment, payment.failureReason);
  }

  /**
   * payment.captured is kept as a fallback.
   *
   * For Payment Links, the preferred event is
   * payment_link.paid because it contains reference_id.
   */
  private async handlePaymentCaptured(
    razorpayPayment: RazorpayWebhookPaymentEntity | undefined,
  ): Promise<void> {
    if (!razorpayPayment?.id) {
      return;
    }

    const databasePaymentId = this.resolveDatabasePaymentId(
      undefined,
      razorpayPayment.notes?.paymentId,
    );

    let payment: Payment | null = null;

    if (databasePaymentId) {
      payment = await this.paymentRepository.findPaymentById(databasePaymentId);
    }

    if (!payment && razorpayPayment.order_id) {
      payment = await this.paymentRepository.findByRazorpayOrderId(
        razorpayPayment.order_id,
      );
    }

    if (!payment) {
      this.logger.warn(
        `Unable to identify local payment for captured Razorpay payment ${razorpayPayment.id}`,
      );

      return;
    }

    if (
      payment.status === PAYMENT_STATUS.SUCCESS &&
      payment.razorpayPaymentId === razorpayPayment.id
    ) {
      await this.populateRazorpayMetadata(payment, razorpayPayment, undefined);
      await this.paymentRepository.savePayment(payment);
      return;
    }

    payment.status = PAYMENT_STATUS.SUCCESS;

    if (razorpayPayment.id) {
      payment.razorpayPaymentId = razorpayPayment.id;
    }

    if (razorpayPayment.order_id) {
      payment.razorpayOrderId = razorpayPayment.order_id;
    }

    payment.paymentMethod = this.mapRazorpayMethod(
      razorpayPayment.method,
      payment.paymentMethod,
    );

    payment.failureReason = undefined;

    payment.paidAt = razorpayPayment.created_at
      ? new Date(razorpayPayment.created_at * 1000)
      : new Date();

    await this.populateRazorpayMetadata(payment, razorpayPayment, undefined);

    await this.finalizeSuccessfulPayment(payment);

    await this.auditLogService.createAuditLog({
      actorId: null,
      actorType: ACTOR_TYPE.WEBHOOK,
      actorRole: undefined,
      module: AUDIT_MODULE.PAYMENT,
      entity: 'Payment',
      entityId: String(payment.id),
      action: 'PAYMENT_SUCCESS',
      message: `Payment #${payment.id} completed successfully via Razorpay Webhook (captured).`,
      newValue: {
        status: PAYMENT_STATUS.SUCCESS,
        razorpayPaymentId: payment.razorpayPaymentId,
      },
    });
  }

  private async populateRazorpayMetadata(
    payment: Payment,
    razorpayPayment?: RazorpayWebhookPaymentEntity,
    paymentLink?: RazorpayWebhookPaymentLinkEntity,
  ): Promise<void> {
    if (razorpayPayment?.id) {
      payment.razorpayPaymentId = razorpayPayment.id;
    }
    if (paymentLink?.id) {
      payment.razorpayPaymentLinkId = paymentLink.id;
    }
    if (razorpayPayment?.order_id) {
      payment.razorpayOrderId = razorpayPayment.order_id;
    }

    if (razorpayPayment?.amount != null) {
      payment.customerPaidAmount = Number(razorpayPayment.amount) / 100;
    } else if (paymentLink?.amount_paid != null) {
      payment.customerPaidAmount = Number(paymentLink.amount_paid) / 100;
    }

    let fee =
      razorpayPayment?.fee != null ? Number(razorpayPayment.fee) / 100 : null;
    let tax =
      razorpayPayment?.tax != null ? Number(razorpayPayment.tax) / 100 : null;

    if (razorpayPayment?.id) {
      try {
        const fetched = await this.razorpay.payments.fetch(razorpayPayment.id);
        if (fetched) {
          if (fee == null && fetched.fee != null) {
            fee = Number(fetched.fee) / 100;
          }
          if (tax == null && fetched.tax != null) {
            tax = Number(fetched.tax) / 100;
          }
          if (payment.customerPaidAmount == null && fetched.amount != null) {
            payment.customerPaidAmount = Number(fetched.amount) / 100;
          }
        }
      } catch (fetchErr: any) {
        this.logger.warn(
          `Could not fetch additional Razorpay payment metadata for ${razorpayPayment.id}: ${fetchErr?.message}`,
        );
      }
    }

    if (fee != null) {
      payment.razorpayFee = fee;
    }
    if (tax != null) {
      payment.razorpayTax = tax;
    }
  }

  private async handlePaymentFailed(
    razorpayPayment: RazorpayWebhookPaymentEntity | undefined,
  ): Promise<void> {
    if (!razorpayPayment?.id) {
      return;
    }

    const databasePaymentId = this.resolveDatabasePaymentId(
      undefined,
      razorpayPayment.notes?.paymentId,
    );

    let payment: Payment | null = null;

    if (databasePaymentId) {
      payment = await this.paymentRepository.findPaymentById(databasePaymentId);
    }

    if (!payment && razorpayPayment.order_id) {
      payment = await this.paymentRepository.findByRazorpayOrderId(
        razorpayPayment.order_id,
      );
    }

    if (!payment) {
      this.logger.warn(
        `Unable to identify local payment for failed Razorpay payment ${razorpayPayment.id}`,
      );

      return;
    }

    if (payment.status === PAYMENT_STATUS.SUCCESS) {
      return;
    }

    payment.razorpayPaymentId = razorpayPayment.id;

    payment.status = PAYMENT_STATUS.FAILED;

    payment.paymentMethod = this.mapRazorpayMethod(
      razorpayPayment.method,
      payment.paymentMethod,
    );

    await this.paymentRepository.savePayment(payment);

    if (payment.paymentType === PAYMENT_TYPE.PRODUCT_PAYMENT) {
      const orderRepo = this.dataSource.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { paymentId: payment.id },
      });
      if (order && order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID) {
        order.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
        await orderRepo.save(order);
      }
    }

    await this.auditLogService.createAuditLog({
      actorId: null,
      actorType: ACTOR_TYPE.SYSTEM,
      actorRole: undefined,
      module: AUDIT_MODULE.PAYMENT,
      entity: 'Payment',
      entityId: String(payment.id),
      action: 'PAYMENT_FAILED',
      message: `Payment #${payment.id} failed: ${payment.failureReason}.`,
      oldValue: { status: PAYMENT_STATUS.PENDING },
      newValue: {
        status: payment.status,
        failureReason: payment.failureReason,
      },
    });

    await this.notifyAndEmailProductPaymentFailure(payment, payment.failureReason);
  }

  private resolveDatabasePaymentId(
    referenceId?: string,
    ...possiblePaymentIds: Array<string | undefined>
  ): number | null {
    for (const paymentIdValue of possiblePaymentIds) {
      if (!paymentIdValue) {
        continue;
      }

      const parsedPaymentId = Number(paymentIdValue);

      if (Number.isInteger(parsedPaymentId) && parsedPaymentId > 0) {
        return parsedPaymentId;
      }
    }

    if (referenceId?.startsWith('payment_')) {
      const parsedPaymentId = Number(referenceId.replace('payment_', ''));

      if (Number.isInteger(parsedPaymentId) && parsedPaymentId > 0) {
        return parsedPaymentId;
      }
    }

    return null;
  }

  async getPaymentDetails(
    user: User,
    paymentId: number,
  ): Promise<PaymentDetailsResponse> {
    const payment = await this.paymentRepository.findPaymentById(paymentId);

    if (
      !payment ||
      (payment.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT &&
        !payment.razorpayPaymentLinkId?.trim()) ||
      (user.role === USER_ROLE.CUSTOMER &&
        payment.status === PAYMENT_STATUS.CREATED)
    ) {
      throw new NotFoundException('Payment not found');
    }

    this.validatePaymentViewAccess(user, payment);

    await this.ensurePaymentOrders([payment]);

    const razorpayPayment = await this.resolveRazorpayPayment(payment);

    // TODO: Old call without viewerRole
    // return this.buildCombinedPaymentResponse(payment, razorpayPayment);
    return this.buildCombinedPaymentResponse(
      payment,
      razorpayPayment,
      user.role,
    );
  }

  private validatePaymentViewAccess(user: User, payment: Payment): void {
    if (user.role === USER_ROLE.ADMIN) {
      return;
    }

    if (
      user.role === USER_ROLE.CUSTOMER &&
      (payment.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT ||
        payment.status === PAYMENT_STATUS.CREATED)
    ) {
      throw new ForbiddenException('You cannot access this payment');
    }

    const canAccess =
      payment.createdById === user.id ||
      payment.payerId === user.id ||
      payment.payeeId === user.id ||
      payment.booking?.customerId === user.id ||
      payment.booking?.purohit?.userId === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You cannot access this payment');
    }
  }

  async getBookingPayments(
    user: User,
    bookingId: number,
  ): Promise<PaymentDetailsResponse[]> {
    const booking = await this.bookingRepository.findBookingById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const canAccess =
      user.role === USER_ROLE.ADMIN ||
      booking.customerId === user.id ||
      booking.purohit?.userId === user.id;

    if (!canAccess) {
      throw new ForbiddenException(
        'You cannot access payments for this booking',
      );
    }

    const payments =
      await this.paymentRepository.findPaymentsByBookingId(bookingId);

    // TODO: Old filter that only checked razorpayPaymentLinkId
    // const filteredPayments = payments.filter(
    //   (payment) =>
    //     payment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
    //     Boolean(payment.razorpayPaymentLinkId?.trim()),
    // );
    // TODO: Deprecated.
    // Pending Purohit payout is a booking-level obligation.
    // Customer can have multiple BOOKING_PAYMENT records for one booking,
    // but these must not create multiple payout entries.
    //
    // const filteredPayments = payments.filter((payment) => {
    //   if (user.role === USER_ROLE.CUSTOMER) {
    //     if (payment.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT) {
    //       return false;
    //     }
    //     if (payment.status === PAYMENT_STATUS.CREATED) {
    //       return false;
    //     }
    //   }
    //   return (
    //     payment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
    //     Boolean(payment.razorpayPaymentLinkId?.trim()) ||
    //     payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH
    //   );
    // });
    let filteredPayments = payments.filter((payment) => {
      if (user.role === USER_ROLE.CUSTOMER) {
        if (payment.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT) {
          return false;
        }
        if (payment.status === PAYMENT_STATUS.CREATED) {
          return false;
        }
      }
      return (
        payment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
        Boolean(payment.razorpayPaymentLinkId?.trim()) ||
        payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH
      );
    });

    if (user.role === USER_ROLE.PUROHIT) {
      if (
        booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID ||
        (booking.remainingAmount != null && Number(booking.remainingAmount) > 0)
      ) {
        return [];
      }
      let purohitPayoutPayment = payments.find(
        (p) => p.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT,
      );
      if (
        !purohitPayoutPayment &&
        booking.purohitPayoutStatus !== BOOKING_PAYMENT_STATUS.PAID &&
        Number(booking.purohitPayoutAmount) > 0
      ) {
        purohitPayoutPayment = (await this.ensurePurohitPendingPayout(
          this.dataSource.manager,
          booking,
        )) as any;
      }
      if (purohitPayoutPayment) {
        filteredPayments = [purohitPayoutPayment];
      } else {
        // TODO: Deprecated synthetic payout mapping.
        // Purohit payouts are now represented by an actual
        // PAYMENT_TYPE.PUROHIT_PAYOUT payment record created
        // after the booking is fully paid.
        // const successfulBookingPayments = payments.filter(
        //   (p) =>
        //     p.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT &&
        //     p.status === PAYMENT_STATUS.SUCCESS,
        // );
        // if (successfulBookingPayments.length > 0) {
        //   filteredPayments = [successfulBookingPayments[0]];
        // } else {
        //   filteredPayments = [];
        // }
        filteredPayments = [];
      }
    }

    return Promise.all(
      filteredPayments.map(async (payment) => {
        const razorpayPayment = await this.resolveRazorpayPayment(payment);

        // TODO: Old call without viewerRole
        // return this.buildCombinedPaymentResponse(payment, razorpayPayment);
        return this.buildCombinedPaymentResponse(
          payment,
          razorpayPayment,
          user.role,
        );
      }),
    );
  }

  async getMyPayments(
    user: User,
    query: PaymentQueryDto,
  ): Promise<PaginatedPaymentsResponse> {
    const startTime = Date.now();

    if (user.role === USER_ROLE.PUROHIT) {
      await this.ensurePendingPayoutsForPurohit(user.id);
    }

    const page = Math.max(Number(query.page ?? 1), 1);

    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);

    const search = query.search?.trim() || undefined;

    const repoStart = Date.now();
    const { payments, total } = await this.paymentRepository.findMyPayments({
      userId: user.id,

      userRole: user.role,

      page,
      limit,

      status: query.status,

      paymentType: query.paymentType,

      purohitPayoutStatus: query.purohitPayoutStatus,

      bookingPaymentStatus: query.bookingPaymentStatus,

      search,
    });
    const repoQueryDurationMs = Date.now() - repoStart;

    // TODO: Old displayedPayments filter
    // const displayedPayments =
    //   user.role === USER_ROLE.CUSTOMER
    //     ? payments.filter(
    //         (payment) =>
    //           payment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
    //           Boolean(payment.razorpayPaymentLinkId?.trim()),
    //       )
    //     : payments;
    // TODO: Deprecated.
    // Pending Purohit payout is a booking-level obligation.
    // Customer can have multiple BOOKING_PAYMENT records for one booking,
    // but these must not create multiple payout entries.
    //
    // const displayedPayments =
    //   user.role === USER_ROLE.CUSTOMER
    //     ? payments.filter(
    //       (payment) =>
    //         payment.status !== PAYMENT_STATUS.CREATED &&
    //         payment.paymentType !== PAYMENT_TYPE.PUROHIT_PAYOUT &&
    //         (payment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
    //           Boolean(payment.razorpayPaymentLinkId?.trim()) ||
    //           payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH),
    //     )
    //     : payments;
    let displayedPayments = payments;

    if (user.role === USER_ROLE.CUSTOMER) {
      displayedPayments = payments.filter(
        (payment) =>
          payment.status !== PAYMENT_STATUS.CREATED &&
          payment.paymentType !== PAYMENT_TYPE.PUROHIT_PAYOUT &&
          (payment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT ||
            Boolean(payment.razorpayPaymentLinkId?.trim()) ||
            payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH),
      );
    } else if (user.role === USER_ROLE.PUROHIT) {
      const seenBookingIds = new Set<number>();
      displayedPayments = payments.filter((payment) => {
        const primaryBooking =
          payment.booking ?? payment.paymentBookings?.[0]?.booking;

        if (primaryBooking) {
          // 1. Only show bookings where paymentStatus is PAID
          if (primaryBooking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID) {
            return false;
          }

          // 2. Booking's remainingAmount must be 0 (or null/<=0)
          if (
            primaryBooking.remainingAmount != null &&
            Number(primaryBooking.remainingAmount) > 0
          ) {
            return false;
          }

          // 3. Strictly only one payout entry per booking
          if (seenBookingIds.has(primaryBooking.id)) {
            return false;
          }
          seenBookingIds.add(primaryBooking.id);
        }

        return true;
      });
    }

    const ordersStart = Date.now();
    await this.ensurePaymentOrders(displayedPayments);
    const ensureOrdersDurationMs = Date.now() - ordersStart;

    // TODO: Old unbounded Promise.all mapping without request deduplication
    // const items = await Promise.all(
    //   displayedPayments.map(async (payment) => {
    //     const razorpayPayment = await this.resolveRazorpayPayment(payment);
    //
    //     return this.buildCombinedPaymentResponse(
    //       payment,
    //       razorpayPayment,
    //       user.role,
    //     );
    //   }),
    // );

    const paymentCache = new Map<string, Promise<RazorpayPaymentData | null>>();
    const orderCache = new Map<string, Promise<RazorpayPaymentData[]>>();
    const razorpayStats = {
      attempted: 0,
      skipped: 0,
      successful: 0,
      notFound400: 0,
    };

    const razorpayStart = Date.now();
    const razorpayPayments = await this.resolveRazorpayPaymentsBatch(
      displayedPayments,
      paymentCache,
      orderCache,
      razorpayStats,
      5,
    );
    const razorpayFetchDurationMs = Date.now() - razorpayStart;

    const buildStart = Date.now();
    const items = displayedPayments.map((payment, index) => {
      const razorpayPayment = razorpayPayments[index];

      return this.buildCombinedPaymentResponse(
        payment,
        razorpayPayment,
        user.role,
      );
    });
    const buildResponseDurationMs = Date.now() - buildStart;

    const totalDurationMs = Date.now() - startTime;

    this.logger.log(
      `[getMyPayments] Total: ${totalDurationMs}ms | Repo: ${repoQueryDurationMs}ms | Orders: ${ensureOrdersDurationMs}ms | Razorpay: ${razorpayFetchDurationMs}ms (attempted: ${razorpayStats.attempted}, skipped: ${razorpayStats.skipped}, successful: ${razorpayStats.successful}, notFound400: ${razorpayStats.notFound400}) | Build: ${buildResponseDurationMs}ms (items: ${items.length}, total: ${total})`,
    );

    return {
      items,

      pagination: {
        page,
        limit,
        total,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async generateInvoicePdf(
    user: User,
    bookingId: number,
  ): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    return this.generateBookingInvoicePdf(user, bookingId);
  }

  // TODO: Replaced by hardened generateBookingInvoicePdf that:
  // 1. Resolves booking by bookingId (with fallback to paymentId if caller passed paymentId)
  // 2. Resolves confirmed payment via booking.bookingPaymentId first, then findLatestByBookingId
  // 3. Handles unpaid / pending / proforma booking invoices gracefully without throwing 404
  // 4. Correctly preserves all token, remaining, discount, donation, customer-paid, and Razorpay fee breakdowns
  // async generateBookingInvoicePdf(
  //   user: User,
  //   bookingId: number,
  // ): Promise<{
  //   buffer: Buffer;
  //   filename: string;
  // }> {
  //   const booking = await this.bookingRepository.findBookingById(bookingId);
  //   if (!booking) {
  //     throw new NotFoundException('Booking not found');
  //   }
  //   const canDownload =
  //     user.role === USER_ROLE.ADMIN ||
  //     booking.customerId === user.id ||
  //     booking.purohit?.userId === user.id;
  //   if (!canDownload) {
  //     throw new ForbiddenException(
  //       'You are not allowed to download this invoice',
  //     );
  //   }
  //   const payment = await this.paymentRepository.findLatestByBookingId(
  //     booking.id,
  //   );
  //   if (!payment) {
  //     throw new NotFoundException('Payment record not found');
  //   }
  //   const razorpayPayment = await this.resolveRazorpayPayment(payment);
  //   const finalStatus = this.resolvePaymentStatus(payment, razorpayPayment);
  //   const isPaid = this.isSuccessfulPaymentStatus(finalStatus);
  //   const amount =
  //     razorpayPayment?.amount != null
  //       ? Number(razorpayPayment.amount) / 100
  //       : Number(payment.amount ?? 0);
  //   const invoiceTitle = isPaid
  //     ? 'Poojawala Tax Invoice'
  //     : 'Poojawala Proforma Invoice';
  //   const invoiceId = isPaid
  //     ? `INV-${booking.bookingNumber}`
  //     : `PROFORMA-${booking.bookingNumber}`;
  //   const customerPaidAmount =
  //     payment.customerPaidAmount != null
  //       ? Number(payment.customerPaidAmount)
  //       : (razorpayPayment?.amount != null
  //         ? Number(razorpayPayment.amount) / 100
  //         : (isPaid ? Number(payment.amount ?? booking.finalAmount) : null));
  //   const razorpayFee =
  //     payment.razorpayFee != null
  //       ? Number(payment.razorpayFee)
  //       : (razorpayPayment?.fee != null ? Number(razorpayPayment.fee) / 100 : null);
  //   const razorpayTax =
  //     payment.razorpayTax != null
  //       ? Number(payment.razorpayTax)
  //       : (razorpayPayment?.tax != null ? Number(razorpayPayment.tax) / 100 : null);
  //   const html = paymentInvoiceTemplate({ ... });
  //   return this.renderHtmlToPdf(
  //     html,
  //     `invoice-${booking.bookingNumber}.pdf`,
  //     `booking ${booking.id}`,
  //   );
  // }
  async generateBookingInvoicePdf(
    user: User,
    bookingId: number,
  ): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    let booking = await this.bookingRepository.findBookingById(bookingId);

    // If not found by bookingId, verify if caller passed a paymentId referencing a booking
    if (!booking) {
      const paymentById = await this.paymentRepository.findPaymentById(bookingId);
      const linkedBookingId =
        paymentById?.bookingId ??
        paymentById?.booking?.id ??
        paymentById?.paymentBookings?.[0]?.bookingId;

      if (linkedBookingId) {
        booking = await this.bookingRepository.findBookingById(linkedBookingId);
      }
    }

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const canDownload =
      user.role === USER_ROLE.ADMIN ||
      booking.customerId === user.id ||
      booking.purohit?.userId === user.id;

    if (!canDownload) {
      throw new ForbiddenException(
        'You are not allowed to download this invoice',
      );
    }

    // 1. Try to load confirmed payment via bookingPaymentId if set
    let payment: Payment | null = null;
    if (booking.bookingPaymentId) {
      payment = await this.paymentRepository.findPaymentById(
        booking.bookingPaymentId,
      );
    }

    // 2. If not found via bookingPaymentId, find latest payment by bookingId (including payment_bookings junction)
    if (!payment) {
      payment = await this.paymentRepository.findLatestByBookingId(
        booking.id,
      );
    }

    const razorpayPayment = payment
      ? await this.resolveRazorpayPayment(payment)
      : undefined;

    const finalStatus = payment
      ? this.resolvePaymentStatus(payment, razorpayPayment ?? null)
      : (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID
        ? PAYMENT_STATUS.SUCCESS
        : PAYMENT_STATUS.PENDING);

    const isPaid =
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
      this.isSuccessfulPaymentStatus(finalStatus);

    const amount =
      razorpayPayment?.amount != null
        ? Number(razorpayPayment.amount) / 100
        : (payment?.amount != null
          ? Number(payment.amount)
          : (Number(booking.paidAmount) > 0
            ? Number(booking.paidAmount)
            : Number(booking.finalAmount ?? 0)));

    const invoiceTitle = isPaid
      ? 'Poojawala Tax Invoice'
      : 'Poojawala Proforma Invoice';

    const invoiceId = isPaid
      ? `INV-${booking.bookingNumber}`
      : `PROFORMA-${booking.bookingNumber}`;

    const customerPaidAmount =
      payment?.customerPaidAmount != null
        ? Number(payment.customerPaidAmount)
        : (razorpayPayment?.amount != null
          ? Number(razorpayPayment.amount) / 100
          : (isPaid
            ? Number(
                payment?.amount ??
                  (Number(booking.paidAmount) > 0
                    ? booking.paidAmount
                    : booking.finalAmount),
              )
            : null));

    const razorpayFee =
      payment?.razorpayFee != null
        ? Number(payment.razorpayFee)
        : (razorpayPayment?.fee != null
          ? Number(razorpayPayment.fee) / 100
          : null);

    const razorpayTax =
      payment?.razorpayTax != null
        ? Number(payment.razorpayTax)
        : (razorpayPayment?.tax != null
          ? Number(razorpayPayment.tax) / 100
          : null);

    const paymentDate =
      payment?.paidAt ?? payment?.createdAt ?? booking.createdAt;

    const paymentMethodDisplay = payment
      ? (payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH
        ? 'Cash'
        : this.formatPaymentMethod(
            razorpayPayment?.method ?? payment.paymentMethod ?? '-',
          ))
      : (booking.paymentType === BOOKING_PAYMENT_TYPE.DEFERRED
        ? 'Pay After Service (Deferred)'
        : '-');

    const html = paymentInvoiceTemplate({
      invoiceType: 'BOOKING',
      companyName: process.env['POOJAWALA_COMPANY_NAME'] ?? 'Poojawala',
      companyEmail: process.env['POOJAWALA_COMPANY_EMAIL'] ?? '-',
      companyPhone: process.env['POOJAWALA_COMPANY_PHONE'] ?? '-',
      companyAddress: process.env['POOJAWALA_COMPANY_ADDRESS'] ?? '-',
      companyGstin: process.env['POOJAWALA_GSTIN'] ?? '-',
      billingAddress: this.getBillingAddress(booking),
      purohitName: this.getPurohitName(booking),
      invoiceTitle,
      invoiceId,
      dateLabel: isPaid ? 'Payment Date' : 'Invoice Date',
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      customerName: this.getCustomerName(booking),
      customerEmail: booking.customer?.email ?? '-',
      customerPhone: booking.customer?.phone ?? '-',
      serviceName: booking.service?.name ?? '-',
      bookingStatus: booking.status,
      paymentId: String(
        razorpayPayment?.id ??
          payment?.razorpayPaymentId ??
          (payment ? String(payment.id) : '-'),
      ),
      orderId: String(
        razorpayPayment?.order_id ?? payment?.razorpayOrderId ?? '-',
      ),
      paymentMethod: paymentMethodDisplay,
      paymentStatus: this.getPaymentStatusDisplay(finalStatus),
      statusClass: this.getStatusClass(finalStatus),
      currency: String(
        razorpayPayment?.currency ?? payment?.currency ?? 'INR',
      ),
      amount: amount.toFixed(2),
      finalAmount: Number(booking.finalAmount).toFixed(2),
      customerPaidAmount:
        customerPaidAmount != null ? customerPaidAmount.toFixed(2) : null,
      razorpayFee: razorpayFee != null ? razorpayFee.toFixed(2) : null,
      razorpayTax: razorpayTax != null ? razorpayTax.toFixed(2) : null,
      paidAmount:
        booking.paidAmount != null ? Number(booking.paidAmount).toFixed(2) : null,
      remainingAmount:
        booking.remainingAmount != null
          ? Number(booking.remainingAmount).toFixed(2)
          : null,
      donationAmount: Number(booking.donationAmount ?? 0).toFixed(2),
      discountAmount: Number(booking.discountAmount ?? 0).toFixed(2),
      date: new Date(paymentDate).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      }),
      errorMessage: String(
        razorpayPayment?.error_description ?? payment?.failureReason ?? '-',
      ),
    });

    return this.renderHtmlToPdf(
      html,
      `invoice-${booking.bookingNumber}.pdf`,
      `booking ${booking.id}`,
    );
  }

  async generateOrderInvoicePdf(
    user: User,
    orderId: number,
  ): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    const order = await this.findOrderForInvoice(orderId);

    if (!order) {
      throw new NotFoundException(`Order ORD-${orderId} not found`);
    }

    const canDownload =
      user.role === USER_ROLE.ADMIN ||
      order.customerId === user.id;

    if (!canDownload) {
      throw new ForbiddenException(
        'You are not allowed to download this invoice',
      );
    }

    let payment = order.payment;
    if (!payment && order.paymentId) {
      payment =
        (await this.paymentRepository.findOne({
          where: { id: order.paymentId },
        })) ?? undefined;
    }

    const razorpayPayment = payment
      ? await this.resolveRazorpayPayment(payment)
      : undefined;

    const isPaid = order.paymentStatus === ORDER_PAYMENT_STATUS.PAID;

    const invoiceTitle = isPaid
      ? 'Poojawala Tax Invoice'
      : 'Poojawala Proforma Invoice';

    const invoiceId = isPaid
      ? `INV-${order.orderNumber}`
      : `PROFORMA-${order.orderNumber}`;

    const totalAmount = Number(order.totalAmount);
    const subtotal = Number(order.subtotal ?? totalAmount);
    const discountAmount = Number(order.discountAmount ?? 0);

    const paidAmount = isPaid
      ? (razorpayPayment?.amount != null
        ? Number(razorpayPayment.amount) / 100
        : (payment?.amount != null ? Number(payment.amount) : totalAmount))
      : 0;

    const paymentMethodDisplay =
      order.paymentMethod === ORDER_PAYMENT_METHOD.COD
        ? 'Cash on Delivery (COD)'
        : (payment?.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH
          ? 'Cash'
          : this.formatPaymentMethod(
            razorpayPayment?.method ?? payment?.paymentMethod ?? 'ONLINE',
          ));

    const paymentStatusDisplay = isPaid
      ? 'Paid'
      : order.paymentStatus === ORDER_PAYMENT_STATUS.COD_PENDING
        ? 'COD Pending'
        : order.paymentStatus === ORDER_PAYMENT_STATUS.FAILED
          ? 'Failed'
          : order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED
            ? 'Refunded'
            : 'Pending';

    const statusClass = isPaid
      ? 'success'
      : order.paymentStatus === ORDER_PAYMENT_STATUS.FAILED
        ? 'failed'
        : order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED
          ? 'refunded'
          : 'pending';

    const orderItems: InvoiceOrderItem[] = (order.items || []).map((item) => ({
      productName: item.productNameSnapshot || 'Product',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPriceSnapshot) || 0,
      totalAmount: Number(item.totalAmount) || 0,
    }));

    const customerName =
      order.shippingAddressSnapshot?.name?.trim() ||
      (order.customer
        ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ')
        : 'Customer');

    const customerPhone =
      order.shippingAddressSnapshot?.phone?.trim() ||
      order.customer?.phone ||
      '-';

    const customerEmail = order.customer?.email || '-';

    const billingAddress = this.formatOrderAddress(order.shippingAddressSnapshot);

    const customerPaidAmount =
      payment?.customerPaidAmount != null
        ? Number(payment.customerPaidAmount)
        : (razorpayPayment?.amount != null
          ? Number(razorpayPayment.amount) / 100
          : (isPaid ? (payment?.amount != null ? Number(payment.amount) : totalAmount) : null));

    const razorpayFee =
      payment?.razorpayFee != null
        ? Number(payment.razorpayFee)
        : (razorpayPayment?.fee != null ? Number(razorpayPayment.fee) / 100 : null);

    const razorpayTax =
      payment?.razorpayTax != null
        ? Number(payment.razorpayTax)
        : (razorpayPayment?.tax != null ? Number(razorpayPayment.tax) / 100 : null);

    const html = paymentInvoiceTemplate({
      invoiceType: 'ORDER',
      companyName: process.env['POOJAWALA_COMPANY_NAME'] ?? 'Poojawala',
      companyEmail: process.env['POOJAWALA_COMPANY_EMAIL'] ?? '-',
      companyPhone: process.env['POOJAWALA_COMPANY_PHONE'] ?? '-',
      companyAddress: process.env['POOJAWALA_COMPANY_ADDRESS'] ?? '-',
      companyGstin: process.env['POOJAWALA_GSTIN'] ?? '-',
      billingAddress,
      customerName,
      customerEmail,
      customerPhone,
      invoiceTitle,
      invoiceId,
      dateLabel: isPaid ? 'Payment Date' : 'Order Date',
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      orderItems,
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      feeAmount: '0.00',
      taxAmount: '0.00',
      paymentId: String(
        razorpayPayment?.id ??
        payment?.razorpayPaymentId ??
        (order.paymentId
          ? `PAY-${order.paymentId}`
          : order.paymentMethod === ORDER_PAYMENT_METHOD.COD && isPaid
            ? `COD-${order.id}`
            : '-'),
      ),
      orderId: `ORD-${order.id}`,
      razorpayOrderId: String(
        razorpayPayment?.order_id ?? payment?.razorpayOrderId ?? '-',
      ),
      paymentMethod: paymentMethodDisplay,
      paymentStatus: paymentStatusDisplay,
      statusClass,
      currency: String(razorpayPayment?.currency ?? payment?.currency ?? 'INR'),
      amount: paidAmount.toFixed(2),
      finalAmount: totalAmount.toFixed(2),
      customerPaidAmount:
        customerPaidAmount != null ? customerPaidAmount.toFixed(2) : null,
      razorpayFee: razorpayFee != null ? razorpayFee.toFixed(2) : null,
      razorpayTax: razorpayTax != null ? razorpayTax.toFixed(2) : null,
      date: new Date(payment?.paidAt ?? order.createdAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      }),
      errorMessage: String(
        razorpayPayment?.error_description ?? payment?.failureReason ?? '-',
      ),
    });

    return this.renderHtmlToPdf(
      html,
      `invoice-${order.orderNumber}.pdf`,
      `order ${order.id}`,
    );
  }

  private async findOrderForInvoice(orderId: number): Promise<Order | null> {
    const orderRepo = this.dataSource.getRepository(Order);
    return orderRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'payment', 'customer'],
    });
  }

  private formatOrderAddress(snapshot?: ShippingAddressSnapshot | null): string {
    if (!snapshot) return '-';
    const parts = [
      snapshot.addressLine1,
      snapshot.addressLine2,
      snapshot.city,
      snapshot.state,
      snapshot.pincode,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length > 0 ? parts.join(', ') : '-';
  }

  private async renderHtmlToPdf(
    html: string,
    filename: string,
    logContext: string,
  ): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: ['load', 'domcontentloaded'],
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      return {
        buffer: Buffer.from(pdfBuffer),
        filename,
      };
    } catch (error) {
      this.logger.error(
        `Invoice generation failed for ${logContext}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException('Unable to generate invoice PDF');
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private getRefundPaymentId(
    refund: RazorpayWebhookRefundEntity | undefined,
  ): number | null {
    const refundPaymentId = refund?.notes?.refundPaymentId;

    if (!refundPaymentId) {
      return null;
    }

    const parsedId = Number(refundPaymentId);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return null;
    }

    return parsedId;
  }

  // TODO: Replaced un-timed and [object Object] logging implementation
  // private async fetchPaymentFromRazorpay(
  //   razorpayPaymentId: string,
  // ): Promise<RazorpayPaymentData | null> {
  //   try {
  //     return (await this.razorpay.payments.fetch(
  //       razorpayPaymentId,
  //     )) as unknown as RazorpayPaymentData;
  //   } catch (error) {
  //     this.logger.warn(
  //       `Unable to fetch Razorpay payment ${razorpayPaymentId}: ${error instanceof Error ? error.message : String(error)
  //       }`,
  //     );
  //
  //     return null;
  //   }
  // }
  private shouldFetchRazorpay(payment: Payment): boolean {
    // 1. Skip if no Razorpay payment ID exists
    if (!payment.razorpayPaymentId?.trim()) {
      return false;
    }

    // 2. Skip for purohit payouts (payouts never expose live customer Razorpay details)
    if (payment.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT) {
      return false;
    }

    // 3. Skip for cash payments
    if (
      payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH ||
      (payment.paymentMethod as string)?.toUpperCase() === 'CASH'
    ) {
      return false;
    }

    // TODO: Old hasCompleteDbData required non-null customerPaidAmount and failureReason
    // const hasCompleteDbData =
    //   payment.status === PAYMENT_STATUS.SUCCESS &&
    //   payment.amount != null &&
    //   payment.customerPaidAmount != null &&
    //   payment.paymentMethod != null &&
    //   payment.paidAt != null &&
    //   payment.razorpayFee != null &&
    //   payment.razorpayTax != null;
    // if (hasCompleteDbData) { return false; }
    // if (payment.status === PAYMENT_STATUS.FAILED && payment.failureReason) { return false; }

    // 4. If payment is in a terminal SUCCESS state and already has core database records:
    // (status is SUCCESS, amount is present, paidAt or paymentMethod is recorded)
    // The database data already satisfies the complete response requirements.
    if (
      payment.status === PAYMENT_STATUS.SUCCESS &&
      payment.amount != null &&
      (payment.paidAt != null || payment.paymentMethod != null)
    ) {
      return false;
    }

    // 5. If payment is already in terminal FAILED state in the database
    if (payment.status === PAYMENT_STATUS.FAILED) {
      return false;
    }

    // Otherwise, live data is genuinely required (e.g. status is PENDING, or missing fee/tax/method/paidAt)
    return true;
  }

  private async fetchPaymentFromRazorpay(
    razorpayPaymentId: string,
    stats?: { notFound400: number },
  ): Promise<RazorpayPaymentData | null> {
    try {
      return (await this.withTimeout(
        this.razorpay.payments.fetch(razorpayPaymentId),
        3500,
        `Razorpay payment fetch timed out after 3500ms`,
      )) as unknown as RazorpayPaymentData;
    } catch (error) {
      const errObj = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
      const statusCode = errObj?.['statusCode'] ?? errObj?.['status'];
      const nestedError =
        errObj?.['error'] && typeof errObj['error'] === 'object'
          ? (errObj['error'] as Record<string, unknown>)
          : null;
      const code = nestedError?.['code'] ?? errObj?.['code'];

      if (statusCode === 400 && code === 'BAD_REQUEST_ERROR') {
        if (stats) {
          stats.notFound400++;
        }
      }

      this.logger.warn(
        `Unable to fetch Razorpay payment ${razorpayPaymentId}: ${this.formatRazorpayError(error)}`,
      );

      return null;
    }
  }

  // TODO: Replaced un-timed and [object Object] logging implementation
  // private async fetchOrderPaymentsFromRazorpay(
  //   razorpayOrderId: string,
  // ): Promise<RazorpayPaymentData[]> {
  //   try {
  //     const response = (await this.razorpay.orders.fetchPayments(
  //       razorpayOrderId,
  //     )) as unknown as RazorpayPaymentCollection;
  //
  //     return response.items ?? [];
  //   } catch (error) {
  //     this.logger.warn(
  //       `Unable to fetch payments for Razorpay order ${razorpayOrderId}: ${error instanceof Error ? error.message : String(error)
  //       }`,
  //     );
  //
  //     return [];
  //   }
  // }
  private async fetchOrderPaymentsFromRazorpay(
    razorpayOrderId: string,
  ): Promise<RazorpayPaymentData[]> {
    try {
      const response = (await this.withTimeout(
        this.razorpay.orders.fetchPayments(razorpayOrderId),
        3500,
        `Razorpay order payments fetch timed out after 3500ms`,
      )) as unknown as RazorpayPaymentCollection;

      return response.items ?? [];
    } catch (error) {
      this.logger.warn(
        `Unable to fetch payments for Razorpay order ${razorpayOrderId}: ${this.formatRazorpayError(error)}`,
      );

      return [];
    }
  }

  private selectBestRazorpayPayment(
    payments: RazorpayPaymentData[],
  ): RazorpayPaymentData | null {
    if (!payments.length) {
      return null;
    }

    const priority: Record<string, number> = {
      captured: 5,
      authorized: 4,
      refunded: 3,
      created: 2,
      failed: 1,
    };

    return [...payments].sort((first, second) => {
      const statusDifference =
        (priority[second.status?.toLowerCase() ?? ''] ?? 0) -
        (priority[first.status?.toLowerCase() ?? ''] ?? 0);

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return Number(second.created_at ?? 0) - Number(first.created_at ?? 0);
    })[0];
  }

  // TODO: Replaced uncached resolveRazorpayPayment
  // private async resolveRazorpayPayment(
  //   payment: Payment,
  // ): Promise<RazorpayPaymentData | null> {
  //   if (payment.razorpayPaymentId) {
  //     const directPayment = await this.fetchPaymentFromRazorpay(
  //       payment.razorpayPaymentId,
  //     );
  //
  //     if (directPayment) {
  //       return directPayment;
  //     }
  //   }
  //
  //   if (payment.razorpayOrderId) {
  //     const paymentAttempts = await this.fetchOrderPaymentsFromRazorpay(
  //       payment.razorpayOrderId,
  //     );
  //
  //     return this.selectBestRazorpayPayment(paymentAttempts);
  //   }
  //
  //   return null;
  // }
  private async resolveRazorpayPayment(
    payment: Payment,
    paymentCache?: Map<string, Promise<RazorpayPaymentData | null>>,
    orderCache?: Map<string, Promise<RazorpayPaymentData[]>>,
    stats?: {
      attempted: number;
      skipped: number;
      successful: number;
      notFound400: number;
    },
  ): Promise<RazorpayPaymentData | null> {
    // 1. Skip live Razorpay fetch when database data already satisfies requirements or live call inapplicable
    if (!this.shouldFetchRazorpay(payment)) {
      if (stats) {
        stats.skipped++;
      }
      return null;
    }

    if (payment.razorpayPaymentId) {
      if (stats) {
        stats.attempted++;
      }

      let fetchPromise: Promise<RazorpayPaymentData | null>;
      if (paymentCache) {
        const cached = paymentCache.get(payment.razorpayPaymentId);
        if (cached) {
          fetchPromise = cached;
        } else {
          fetchPromise = this.fetchPaymentFromRazorpay(payment.razorpayPaymentId, stats);
          paymentCache.set(payment.razorpayPaymentId, fetchPromise);
        }
      } else {
        fetchPromise = this.fetchPaymentFromRazorpay(payment.razorpayPaymentId, stats);
      }

      const directPayment = await fetchPromise;

      if (directPayment) {
        if (stats) {
          stats.successful++;
        }
        return directPayment;
      }

      // If direct payment fetch returned null (e.g. 400 BAD_REQUEST_ERROR ID not found or error),
      // do NOT retry or attempt order payments fetch for the same failed payment ID.
      return null;
    }

    if (stats) {
      stats.skipped++;
    }
    return null;
  }

  private async resolveRazorpayPaymentsBatch(
    payments: Payment[],
    paymentCache: Map<string, Promise<RazorpayPaymentData | null>>,
    orderCache: Map<string, Promise<RazorpayPaymentData[]>>,
    stats?: {
      attempted: number;
      skipped: number;
      successful: number;
      notFound400: number;
    },
    concurrencyLimit: number = 5,
  ): Promise<Array<RazorpayPaymentData | null>> {
    if (payments.length === 0) {
      return [];
    }

    const results: Array<RazorpayPaymentData | null> = new Array(payments.length);
    let currentIndex = 0;
    const workerCount = Math.min(concurrencyLimit, payments.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < payments.length) {
        const index = currentIndex++;
        results[index] = await this.resolveRazorpayPayment(
          payments[index],
          paymentCache,
          orderCache,
          stats,
        );
      }
    });

    await Promise.all(workers);
    return results;
  }

  private resolvePaymentStatus(
    payment: Payment,
    razorpayPayment: RazorpayPaymentData | null,
  ): string {
    if (razorpayPayment?.status) {
      return razorpayPayment.status.toLowerCase();
    }

    return String(payment.status ?? PAYMENT_STATUS.PENDING).toLowerCase();
  }

  private mapRazorpayStatus(
    razorpayStatus?: string,
    databaseStatus?: PAYMENT_STATUS,
  ): PAYMENT_STATUS {
    switch (razorpayStatus?.toLowerCase()) {
      case 'captured':
      case 'paid':
        return PAYMENT_STATUS.SUCCESS;

      case 'authorized':
        return PAYMENT_STATUS.PENDING;

      case 'failed':
        return PAYMENT_STATUS.FAILED;

      case 'created':
        return PAYMENT_STATUS.CREATED;

      case 'refunded':
        return PAYMENT_STATUS.SUCCESS;

      default:
        return databaseStatus ?? PAYMENT_STATUS.CREATED;
    }
  }

  private mapRazorpayMethod(
    razorpayMethod?: string,
    databaseMethod?: PAYMENT_METHOD,
  ): PAYMENT_METHOD | undefined {
    switch (razorpayMethod?.toLowerCase()) {
      case 'upi':
        return PAYMENT_METHOD.UPI;

      case 'card':
        return PAYMENT_METHOD.CARD;

      case 'netbanking':
        return PAYMENT_METHOD.NETBANKING;

      case 'wallet':
        return PAYMENT_METHOD.WALLET;

      case 'bank_transfer':
        return PAYMENT_METHOD.BANK_TRANSFER;

      default:
        return databaseMethod;
    }
  }

  private isSuccessfulPaymentStatus(status: string): boolean {
    return ['captured', 'paid', 'success'].includes(status.toLowerCase());
  }

  private getPaymentStatusDisplay(status: string): string {
    switch (status.toLowerCase()) {
      case 'captured':
      case 'paid':
      case 'success':
        return 'Paid';

      case 'failed':
        return 'Failed';

      case 'authorized':
        return 'Authorized';

      case 'refunded':
        return 'Refunded';

      default:
        return 'Pending';
    }
  }

  private getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'captured':
      case 'paid':
      case 'success':
        return 'success';

      case 'failed':
        return 'failed';

      case 'refunded':
        return 'refunded';

      default:
        return 'pending';
    }
  }

  private formatPaymentMethod(method: string): string {
    const methods: Record<string, string> = {
      netbanking: 'Net Banking',

      card: 'Card',
      upi: 'UPI',
      wallet: 'Wallet',
      emi: 'EMI',

      bank_transfer: 'Bank Transfer',
    };

    return methods[method.toLowerCase()] || method || '-';
  }

  private getBillingAddress(booking: Booking): string {
    const snapshot = booking.addressSnapshot as
      | Record<string, unknown>
      | undefined;

    if (!snapshot) {
      return '-';
    }

    return [
      snapshot['fullAddress'],
      snapshot['addressLine1'],
      snapshot['addressLine2'],
      snapshot['city'],
      snapshot['state'],
      snapshot['pincode'],
    ]
      .filter(Boolean)
      .join(', ');
  }

  private getCustomerName(booking: Booking): string {
    return (
      [booking.customer?.firstName, booking.customer?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || '-'
    );
  }

  private getPurohitName(booking: Booking): string {
    return (
      [booking.purohit?.user?.firstName, booking.purohit?.user?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || '-'
    );
  }

  // TODO: Replaced basic parsing with hardened batch resolution, conflict detection, and safety handling
  // private async ensurePaymentOrders(payments: Payment[]): Promise<void> { ... }
  private async ensurePaymentOrders(payments: Payment[]): Promise<void> {
    try {
      const missingOrderPayments = payments.filter(
        (p) => p.paymentType === PAYMENT_TYPE.PRODUCT_PAYMENT && !p.order,
      );

      if (missingOrderPayments.length === 0) {
        return;
      }

      // Reuse already-loaded Order/customer data from payments in memory
      const loadedOrdersById = new Map<number, Order>();
      const loadedOrdersByNumber = new Map<string, Order>();

      for (const p of payments) {
        if (p.order) {
          if (p.order.id) {
            loadedOrdersById.set(p.order.id, p.order);
          }
          if (p.order.orderNumber) {
            loadedOrdersByNumber.set(p.order.orderNumber, p.order);
          }
        }
      }

      interface PaymentOrderCandidate {
        payment: Payment;
        extractedId: number | null;
        extractedNumber: string | null;
        isAmbiguous: boolean;
      }

      const candidates: PaymentOrderCandidate[] = [];
      const orderIdsToFetch = new Set<number>();
      const orderNumbersToFetch = new Set<string>();

      for (const payment of missingOrderPayments) {
        const remark = payment.remark?.trim();
        if (!remark) {
          continue;
        }

        // 1. Extract numeric order IDs (e.g., 'Order ORD-14' or 'Order ORD-5')
        const ordIdMatches = Array.from(
          remark.matchAll(/(?:^|\s)Order\s+ORD-(\d+)(?:\b|$)/gi),
        );
        const uniqueOrdIds = Array.from(
          new Set(
            ordIdMatches
              .map((m) => Number(m[1]))
              .filter((id) => Number.isSafeInteger(id) && id > 0),
          ),
        );

        // 2. Extract alphanumeric order numbers (e.g., 'Order #PW-ORD-548321-8144' or '#PW-ORD-...')
        const ordNumMatches = Array.from(
          remark.matchAll(/#([A-Za-z0-9_-]+)/gi),
        );
        const uniqueOrdNums = Array.from(
          new Set(
            ordNumMatches
              .map((m) => m[1].trim())
              .filter((n) => n.length > 0),
          ),
        );

        // Check for multiple distinct ID matches in the same remark
        if (uniqueOrdIds.length > 1) {
          this.logger.warn(
            `Ambiguous order IDs in remark for payment #${payment.id}: "${remark}" (found IDs: ${uniqueOrdIds.join(', ')})`,
          );
          candidates.push({
            payment,
            extractedId: null,
            extractedNumber: null,
            isAmbiguous: true,
          });
          continue;
        }

        // Check for multiple distinct order number matches in the same remark
        if (uniqueOrdNums.length > 1) {
          this.logger.warn(
            `Ambiguous order numbers in remark for payment #${payment.id}: "${remark}" (found numbers: ${uniqueOrdNums.join(', ')})`,
          );
          candidates.push({
            payment,
            extractedId: null,
            extractedNumber: null,
            isAmbiguous: true,
          });
          continue;
        }

        const extractedId = uniqueOrdIds.length === 1 ? uniqueOrdIds[0] : null;
        const extractedNumber = uniqueOrdNums.length === 1 ? uniqueOrdNums[0] : null;

        if (extractedId == null && extractedNumber == null) {
          continue;
        }

        if (extractedNumber && /^\d+$/.test(extractedNumber)) {
          const numAsId = Number(extractedNumber);
          if (Number.isSafeInteger(numAsId) && numAsId > 0 && !loadedOrdersById.has(numAsId)) {
            orderIdsToFetch.add(numAsId);
          }
        }

        if (extractedId != null && !loadedOrdersById.has(extractedId)) {
          orderIdsToFetch.add(extractedId);
        }
        if (extractedNumber != null && !loadedOrdersByNumber.has(extractedNumber)) {
          orderNumbersToFetch.add(extractedNumber);
        }

        candidates.push({
          payment,
          extractedId,
          extractedNumber,
          isAmbiguous: false,
        });
      }

      let fetchedOrders: Order[] = [];

      if (orderIdsToFetch.size > 0 || orderNumbersToFetch.size > 0) {
        const orderRepo = this.dataSource.getRepository(Order);
        const conditions: Array<FindOptionsWhere<Order>> = [];

        if (orderIdsToFetch.size > 0) {
          conditions.push({ id: In(Array.from(orderIdsToFetch)) });
        }
        if (orderNumbersToFetch.size > 0) {
          conditions.push({ orderNumber: In(Array.from(orderNumbersToFetch)) });
        }

        fetchedOrders = await orderRepo.find({
          where: conditions,
          relations: {
            customer: true,
          },
        });
      }

      // Combine fetched orders and already-loaded in-memory orders
      const orderPool = new Map<number, Order>(loadedOrdersById);
      const orderPoolByNumber = new Map<string, Order>(loadedOrdersByNumber);

      for (const order of fetchedOrders) {
        orderPool.set(order.id, order);
        if (order.orderNumber) {
          orderPoolByNumber.set(order.orderNumber, order);
        }
      }

      for (const candidate of candidates) {
        if (candidate.isAmbiguous) {
          continue;
        }

        const { payment, extractedId, extractedNumber } = candidate;

        let matchedById: Order | null = null;
        let matchedByNumber: Order | null = null;

        if (extractedId != null) {
          matchedById = orderPool.get(extractedId) ?? null;
        }

        if (extractedNumber != null) {
          matchedByNumber = orderPoolByNumber.get(extractedNumber) ?? null;

          if (!matchedByNumber && /^\d+$/.test(extractedNumber)) {
            const numAsId = Number(extractedNumber);
            matchedByNumber = orderPool.get(numAsId) ?? null;
          }
        }

        // Conflict check: if both were extracted and resolved to different orders
        if (
          matchedById &&
          matchedByNumber &&
          matchedById.id !== matchedByNumber.id
        ) {
          this.logger.warn(
            `Conflicting order identifiers for payment #${payment.id}: orderId ${extractedId} resolved to Order #${matchedById.id} (${matchedById.orderNumber}), but orderNumber "${extractedNumber}" resolved to Order #${matchedByNumber.id} (${matchedByNumber.orderNumber}). No association made.`,
          );
          continue;
        }

        const finalMatchedOrder = matchedById ?? matchedByNumber;

        if (finalMatchedOrder) {
          payment.order = finalMatchedOrder;
          if (finalMatchedOrder.id) {
            orderPool.set(finalMatchedOrder.id, finalMatchedOrder);
          }
          if (finalMatchedOrder.orderNumber) {
            orderPoolByNumber.set(finalMatchedOrder.orderNumber, finalMatchedOrder);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to ensure payment orders: ${this.formatRazorpayError(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildCombinedPaymentResponse(
    payment: Payment,
    razorpayPayment: RazorpayPaymentData | null,
    viewerRole?: USER_ROLE,
  ): PaymentDetailsResponse {
    let amount =
      razorpayPayment?.amount != null
        ? Number(razorpayPayment.amount) / 100
        : Number(payment.amount);

    const fee =
      razorpayPayment?.fee != null ? Number(razorpayPayment.fee) / 100 : null;

    const tax =
      razorpayPayment?.tax != null ? Number(razorpayPayment.tax) / 100 : null;

    const amountRefunded =
      razorpayPayment?.amount_refunded != null
        ? Number(razorpayPayment.amount_refunded) / 100
        : null;

    const primaryBooking =
      payment.booking ?? payment.paymentBookings?.[0]?.booking;

    // TODO: Old responsePaymentType calculation
    // let responsePaymentType = payment.paymentType;
    let responsePaymentType: PAYMENT_TYPE | string = payment.paymentType;
    let responseStatus = this.mapRazorpayStatus(
      razorpayPayment?.status,
      payment.status,
    );

    if (payment.paymentType === PAYMENT_TYPE.PUROHIT_PAYOUT) {
      razorpayPayment = null;
    }

    // TODO: Deprecated synthetic payout mapping.
    // Purohit payouts are now represented by an actual
    // PAYMENT_TYPE.PUROHIT_PAYOUT payment record created
    // after the booking is fully paid.
    // if (
    //   viewerRole === USER_ROLE.PUROHIT &&
    //   payment.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT
    // ) {
    //   responsePaymentType = PAYMENT_TYPE.PUROHIT_PAYOUT;
    //   amount =
    //     primaryBooking?.purohitPayoutAmount != null
    //       ? Number(primaryBooking.purohitPayoutAmount)
    //       : 0;
    //   responseStatus =
    //     primaryBooking?.purohitPayoutStatus === BOOKING_PAYMENT_STATUS.PAID
    //       ? PAYMENT_STATUS.SUCCESS
    //       : PAYMENT_STATUS.PENDING;
    //   razorpayPayment = null; // Hide customer payment details from purohit
    // }

    const isBookingPayment =
      payment.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT;
    const isInitiatedByPurohit =
      isBookingPayment &&
      (payment.createdBy?.role === USER_ROLE.PUROHIT ||
        (primaryBooking?.purohit?.userId != null &&
          payment.createdById === primaryBooking.purohit.userId) ||
        (payment.payeeId != null &&
          payment.createdById === payment.payeeId &&
          payment.createdById !== primaryBooking?.customerId) ||
        (primaryBooking?.customerId != null &&
          payment.createdById !== primaryBooking.customerId));

    const isCashPayment =
      payment.customerPaymentMethod === CUSTOMER_PAYMENT_METHOD.CASH ||
      (payment.paymentMethod as string)?.toUpperCase() === 'CASH';

    // TODO: Old behavior where paymentType was overridden to 'CASH' for customers.
    // paymentType should remain BOOKING_PAYMENT, while paymentMethod shows 'CASH'.
    // if (viewerRole === USER_ROLE.CUSTOMER) {
    //   if (isBookingPayment && (isInitiatedByPurohit || isCashPayment)) {
    //     responsePaymentType = 'CASH';
    //   }
    // }

    // TODO: Deprecated.
    // The latest BOOKING_PAYMENT was previously used as the synthetic
    // Purohit payout payment ID. A customer payment is not a payout
    // transaction, so pending payout responses must not expose this ID.
    // id: payment.id,
    let responsePaymentId: number | null = payment.id;
    let formattedPaymentId: string | null = payment.id ? `PAY-${payment.id}` : null;

    // TODO: Replaced unvalidated remark regex fallback with strict validation from payment.order
    // const orderId =
    //   payment.order?.id ??
    //   (payment as any).orderId ??
    //   (() => {
    //     if (!payment.remark) return null;
    //     const matchOrdId = payment.remark.match(/Order\s+(?:ORD-)?(\d+)/i);
    //     return matchOrdId ? Number(matchOrdId[1]) : null;
    //   })() ??
    //   null;
    // const orderNumber =
    //   payment.order?.orderNumber ??
    //   (payment as any).orderNumber ??
    //   (() => {
    //     if (!payment.remark) return null;
    //     const matchOrdNum = payment.remark.match(/Order\s+#?([A-Za-z0-9_-]+)/i);
    //     return matchOrdNum ? matchOrdNum[1] : null;
    //   })() ??
    //   null;

    const orderId = payment.order?.id ?? null;
    const orderNumber = payment.order?.orderNumber ?? null;
    const linkedOrder = payment.order
      ? {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
        }
      : null;

    const resolvedCustomer =
      primaryBooking?.customer ?? payment.order?.customer ?? payment.payer ?? null;

    return {
      id: responsePaymentId as any,
      paymentId: formattedPaymentId,
      customer: resolvedCustomer
        ? `${resolvedCustomer.firstName || ''} ${resolvedCustomer.lastName || ''}`.trim() || null
        : null,

      paymentType: responsePaymentType as any,

      bookingId:
        payment.bookingId ?? payment.paymentBookings?.[0]?.bookingId ?? null,

      orderId,

      orderNumber,

      linkedOrder,

      bookingPaymentStatus: primaryBooking?.paymentStatus ?? null,

      // TODO: Old purohit payout details returned to all roles
      // purohitPayoutStatus: primaryBooking?.purohitPayoutStatus ?? null,
      // purohitPayoutAmount: primaryBooking?.purohitPayoutAmount != null
      //   ? Number(primaryBooking.purohitPayoutAmount)
      //   : null,
      purohitPayoutStatus:
        viewerRole === USER_ROLE.CUSTOMER
          ? null
          : (primaryBooking?.purohitPayoutStatus ?? null),

      purohitPayoutAmount:
        viewerRole === USER_ROLE.CUSTOMER
          ? null
          : primaryBooking?.purohitPayoutAmount != null
            ? Number(primaryBooking.purohitPayoutAmount)
            : null,

      customerDetails: resolvedCustomer
        ? {
          id: resolvedCustomer.id,
          firstName: resolvedCustomer.firstName ?? '',
          lastName: resolvedCustomer.lastName ?? '',
          email: resolvedCustomer.email ?? '',
          phone: resolvedCustomer.phone ?? '',
          profileImage: resolvedCustomer.profileImage ?? null,
        }
        : null,

      linkedBookings:
        payment.paymentBookings?.map((paymentBooking) => ({
          id: paymentBooking.bookingId,

          bookingNumber: paymentBooking.booking?.bookingNumber,
        })) ?? [],

      createdById: payment.createdById,

      payerId: payment.payerId ?? null,

      payeeId: payment.payeeId ?? null,

      amount,

      customerPaidAmount:
        payment.customerPaidAmount != null
          ? Number(payment.customerPaidAmount)
          : null,

      currency: razorpayPayment?.currency ?? payment.currency,

      status: responseStatus,

      providerStatus: razorpayPayment?.status ?? null,

      customerPaymentMethod: payment.customerPaymentMethod ?? null,

      // TODO: Old paymentMethod mapping
      // paymentMethod:
      //   this.mapRazorpayMethod(
      //     razorpayPayment?.method,
      //     payment.paymentMethod,
      //   ) ?? null,
      paymentMethod:
        isCashPayment ||
          (viewerRole === USER_ROLE.CUSTOMER && isInitiatedByPurohit)
          ? 'CASH'
          : (this.mapRazorpayMethod(
            razorpayPayment?.method,
            payment.paymentMethod,
          ) ?? null),

      razorpayOrderId:
        razorpayPayment?.order_id ?? payment.razorpayOrderId ?? null,

      razorpayPaymentLinkId: payment.razorpayPaymentLinkId ?? null,

      razorpayPaymentId:
        razorpayPayment?.id ?? payment.razorpayPaymentId ?? null,

      razorpayRefundId: payment.razorpayRefundId ?? null,

      razorpayFee:
        payment.razorpayFee != null
          ? Number(payment.razorpayFee)
          : fee,

      razorpayTax:
        payment.razorpayTax != null
          ? Number(payment.razorpayTax)
          : tax,

      bankTransferReference: payment.bankTransferReference ?? null,

      failureReason:
        razorpayPayment?.error_description ?? payment.failureReason ?? null,

      paidAt:
        payment.paidAt ??
        (razorpayPayment?.status === 'captured' && razorpayPayment.created_at
          ? new Date(razorpayPayment.created_at * 1000)
          : null),

      createdAt: payment.createdAt,

      updatedAt: payment.updatedAt,

      providerDetails: razorpayPayment
        ? {
          entity: razorpayPayment.entity ?? null,

          international: razorpayPayment.international ?? null,

          captured: razorpayPayment.captured ?? null,

          description: razorpayPayment.description ?? null,

          email: razorpayPayment.email ?? null,

          contact: razorpayPayment.contact ?? null,

          bank: razorpayPayment.bank ?? null,

          wallet: razorpayPayment.wallet ?? null,

          vpa: razorpayPayment.vpa ?? null,

          cardId: razorpayPayment.card_id ?? null,

          invoiceId: razorpayPayment.invoice_id ?? null,

          fee,
          tax,
          amountRefunded,

          refundStatus: razorpayPayment.refund_status ?? null,

          errorCode: razorpayPayment.error_code ?? null,

          errorSource: razorpayPayment.error_source ?? null,

          errorStep: razorpayPayment.error_step ?? null,

          errorReason: razorpayPayment.error_reason ?? null,

          acquirerData: razorpayPayment.acquirer_data ?? null,

          providerCreatedAt: razorpayPayment.created_at
            ? new Date(razorpayPayment.created_at * 1000)
            : null,
        }
        : null,

      source: razorpayPayment ? 'RAZORPAY_WITH_DB_FALLBACK' : 'DATABASE_ONLY',

      razorpay:
        payment.razorpayPaymentId ||
          razorpayPayment?.id ||
          payment.razorpayPaymentLinkId
          ? {
            paymentId:
              payment.razorpayPaymentId ?? razorpayPayment?.id ?? null,
            paymentLinkId: payment.razorpayPaymentLinkId ?? null,
            customerPaidAmount:
              payment.customerPaidAmount != null
                ? Number(payment.customerPaidAmount)
                : razorpayPayment?.amount != null
                  ? Number(razorpayPayment.amount) / 100
                  : null,
            fee:
              payment.razorpayFee != null
                ? Number(payment.razorpayFee)
                : fee,
            tax:
              payment.razorpayTax != null
                ? Number(payment.razorpayTax)
                : tax,
          }
          : null,
    };
  }

  async getAllPayments(
    query: AdminPaymentQueryDto,
  ): Promise<PaginatedPaymentsResponse> {
    const page = Math.max(Number(query.page ?? 1), 1);

    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);

    const search = query.search?.trim() || undefined;

    const { payments, total } = await this.paymentRepository.findAllPayments({
      page,
      limit,

      status: query.status,

      paymentType: query.paymentType,

      paymentMethod: query.paymentMethod,

      purohitPayoutStatus: query.purohitPayoutStatus,

      bookingPaymentStatus: query.bookingPaymentStatus,

      bookingId: query.bookingId,

      customerId: query.customerId,

      purohitId: query.purohitId,

      search,

      fromDate: query.fromDate,

      toDate: query.toDate,
    });

    await this.ensurePaymentOrders(payments);

    const items = await Promise.all(
      payments.map(async (payment) => {
        const razorpayPayment = await this.resolveRazorpayPayment(payment);

        // TODO: Old call without viewerRole
        // return this.buildCombinedPaymentResponse(payment, razorpayPayment);
        return this.buildCombinedPaymentResponse(
          payment,
          razorpayPayment,
          USER_ROLE.ADMIN,
        );
      }),
    );

    return {
      items,

      pagination: {
        page,
        limit,
        total,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createRefund(
    admin: User,
    paymentId: number,
    dto: CreateRefundDto,
  ): Promise<{
    refundPaymentId: number;
    originalPaymentId: number;
    razorpayRefundId: string;
    razorpayPaymentId: string;
    amount: number;
    remainingRefundableAmount: number;
    currency: string;
    providerStatus: string;
    status: PAYMENT_STATUS;
    bookingPaymentStatus: BOOKING_PAYMENT_STATUS | null;
  }> {
    if (admin.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only admins can initiate refunds');
    }

    const originalPayment =
      await this.paymentRepository.findPaymentById(paymentId);

    if (!originalPayment) {
      throw new NotFoundException('Payment not found');
    }

    if (
      originalPayment.paymentType !== PAYMENT_TYPE.BOOKING_PAYMENT &&
      originalPayment.paymentType !== PAYMENT_TYPE.PRODUCT_PAYMENT
    ) {
      throw new BadRequestException('Only booking and product payments can be refunded');
    }

    if (originalPayment.status !== PAYMENT_STATUS.SUCCESS) {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    if (!originalPayment.razorpayPaymentId) {
      throw new BadRequestException('Razorpay payment ID is missing');
    }

    const originalAmount = Number(originalPayment.amount);

    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new BadRequestException('Original payment amount is invalid');
    }

    const refundAmount = Number(dto.amount);

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const reservedRefundAmount =
      await this.paymentRepository.getReservedRefundAmountByRazorpayPaymentId(
        originalPayment.razorpayPaymentId,
      );

    const remainingRefundableAmount = Number(
      (originalAmount - reservedRefundAmount).toFixed(2),
    );

    if (remainingRefundableAmount <= 0) {
      throw new ConflictException(
        'This payment has already been fully refunded or has an active full refund',
      );
    }

    if (refundAmount > remainingRefundableAmount) {
      throw new BadRequestException(
        `Refund amount cannot exceed the remaining refundable amount of ₹${remainingRefundableAmount.toFixed(2)}`,
      );
    }

    const amountInPaise = Math.round(refundAmount * 100);

    const savedRefundPayment = await this.dataSource.transaction(
      async (manager) => {
        const paymentRepository = manager.getRepository(Payment);

        const paymentBookingRepository = manager.getRepository(PaymentBooking);

        /*
         * Lock the original payment while creating
         * the local refund record.
         */
        const lockedOriginalPayment = await paymentRepository
          .createQueryBuilder('payment')
          .where('payment.id = :paymentId', {
            paymentId: originalPayment.id,
          })
          .setLock('pessimistic_write')
          .getOne();

        if (!lockedOriginalPayment) {
          throw new NotFoundException('Original payment not found');
        }

        if (lockedOriginalPayment.status !== PAYMENT_STATUS.SUCCESS) {
          throw new ConflictException(
            'Original payment is no longer eligible for refund',
          );
        }

        const refundPayment = paymentRepository.create({
          paymentType: PAYMENT_TYPE.CUSTOMER_REFUND,

          bookingId: originalPayment.bookingId,

          createdById: admin.id,

          /*
           * Refund flows from the platform/payment
           * receiver back to the customer.
           */
          payerId: originalPayment.payeeId ?? admin.id,

          payeeId: originalPayment.payerId,

          amount: refundAmount,

          currency: originalPayment.currency ?? 'INR',

          paymentMethod: originalPayment.paymentMethod,

          /*
           * Store the original Razorpay payment ID
           * immediately so refund records can be
           * grouped by source payment.
           */
          razorpayPaymentId: originalPayment.razorpayPaymentId,

          status: PAYMENT_STATUS.PENDING,
        });

        const savedPayment = await paymentRepository.save(refundPayment);

        if (originalPayment.bookingId) {
          const mapping = paymentBookingRepository.create({
            paymentId: savedPayment.id,

            bookingId: originalPayment.bookingId,
          });

          await paymentBookingRepository.save(mapping);
        }

        return savedPayment;
      },
    );

    try {
      const razorpayRefund = (await this.razorpay.payments.refund(
        originalPayment.razorpayPaymentId,
        {
          amount: amountInPaise,

          speed: 'normal',

          notes: {
            originalPaymentId: String(originalPayment.id),

            refundPaymentId: String(savedRefundPayment.id),

            bookingId: String(originalPayment.bookingId ?? ''),

            reason: dto.reason?.trim() || 'Admin initiated refund',
          },
        },
      )) as unknown as RazorpayRefundData;

      if (!razorpayRefund.id) {
        throw new InternalServerErrorException(
          'Invalid refund response received from Razorpay',
        );
      }

      savedRefundPayment.razorpayRefundId = razorpayRefund.id;

      savedRefundPayment.razorpayPaymentId = originalPayment.razorpayPaymentId;

      const providerStatus =
        razorpayRefund.status?.trim().toLowerCase() ?? 'pending';

      switch (providerStatus) {
        case 'processed':
          savedRefundPayment.status = PAYMENT_STATUS.SUCCESS;

          savedRefundPayment.paidAt = razorpayRefund.created_at
            ? new Date(razorpayRefund.created_at * 1000)
            : new Date();

          savedRefundPayment.failureReason = undefined;
          break;

        case 'failed':
          savedRefundPayment.status = PAYMENT_STATUS.FAILED;

          savedRefundPayment.failureReason = 'Refund failed at Razorpay';
          break;

        case 'pending':
        default:
          savedRefundPayment.status = PAYMENT_STATUS.PENDING;

          savedRefundPayment.failureReason = undefined;
          break;
      }

      await this.paymentRepository.savePayment(savedRefundPayment);

      let bookingPaymentStatus: BOOKING_PAYMENT_STATUS | null = null;

      /*
       * A processed response can immediately update the
       * booking. Pending refunds will be finalized by the
       * refund.processed webhook.
       */
      if (savedRefundPayment.status === PAYMENT_STATUS.SUCCESS) {
        bookingPaymentStatus =
          await this.synchronizeBookingRefundStatus(originalPayment);
      } else if (originalPayment.bookingId) {
        const booking = await this.bookingRepository.findBookingById(
          originalPayment.bookingId,
        );

        bookingPaymentStatus = booking?.paymentStatus ?? null;
      }

      const finalRemainingRefundableAmount = Number(
        Math.max(0, remainingRefundableAmount - refundAmount).toFixed(2),
      );

      return {
        refundPaymentId: savedRefundPayment.id,
        originalPaymentId: originalPayment.id,
        razorpayRefundId: razorpayRefund.id,
        razorpayPaymentId: originalPayment.razorpayPaymentId,
        amount: refundAmount,
        remainingRefundableAmount: finalRemainingRefundableAmount,
        currency: razorpayRefund.currency ?? originalPayment.currency ?? 'INR',
        providerStatus,
        status: savedRefundPayment.status,
        bookingPaymentStatus,
      };
    } catch (error) {
      const failureReason = this.getRazorpayErrorMessage(
        error,
        'Unable to create refund',
      );

      /*
       * If Razorpay clearly rejected the request,
       * mark it as failed.
       *
       * Network failures can be uncertain because the
       * provider may have accepted the refund.
       */
      savedRefundPayment.status = PAYMENT_STATUS.FAILED;

      savedRefundPayment.failureReason = failureReason;

      await this.paymentRepository.savePayment(savedRefundPayment);

      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new BadRequestException(failureReason);
    }
  }

  private getRazorpayErrorMessage(
    error: unknown,
    fallbackMessage: string,
  ): string {
    const razorpayError = error as RazorpayError;

    return (
      razorpayError.error?.description ||
      razorpayError.message ||
      fallbackMessage
    );
  }

  private async synchronizeBookingRefundStatus(
    originalPayment: Payment,
  ): Promise<BOOKING_PAYMENT_STATUS | null> {
    if (!originalPayment.bookingId || !originalPayment.razorpayPaymentId) {
      return null;
    }

    const booking = await this.bookingRepository.findBookingById(
      originalPayment.bookingId,
    );

    if (!booking) {
      this.logger.warn(
        `Booking ${originalPayment.bookingId} not found while synchronizing refund status`,
      );

      return null;
    }

    /*
     * Razorpay is the source of truth for:
     *
     * - refund_status: partial | full | null
     * - amount_refunded: amount in paise
     */
    const razorpayPayment = await this.fetchPaymentFromRazorpay(
      originalPayment.razorpayPaymentId,
    );

    if (!razorpayPayment) {
      this.logger.warn(
        `Unable to fetch Razorpay payment ${originalPayment.razorpayPaymentId} while synchronizing refund status`,
      );

      return booking.paymentStatus;
    }

    const refundStatus = razorpayPayment.refund_status?.trim().toLowerCase();

    const amountRefundedInPaise = Number(razorpayPayment.amount_refunded ?? 0);

    const originalAmountInPaise =
      razorpayPayment.amount != null
        ? Number(razorpayPayment.amount)
        : Math.round(Number(originalPayment.amount) * 100);

    let nextPaymentStatus = booking.paymentStatus;

    if (
      refundStatus === 'full' ||
      (originalAmountInPaise > 0 &&
        amountRefundedInPaise >= originalAmountInPaise)
    ) {
      nextPaymentStatus = BOOKING_PAYMENT_STATUS.REFUNDED;
    } else if (refundStatus === 'partial' || amountRefundedInPaise > 0) {
      nextPaymentStatus = BOOKING_PAYMENT_STATUS.PARTIALLY_REFUNDED;
    } else {
      /*
       * Do not downgrade an already synchronized
       * refund state because Razorpay may temporarily
       * return stale information.
       */
      if (
        booking.paymentStatus !== BOOKING_PAYMENT_STATUS.REFUNDED &&
        booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PARTIALLY_REFUNDED
      ) {
        nextPaymentStatus = BOOKING_PAYMENT_STATUS.PAID;
      }
    }

    if (booking.paymentStatus !== nextPaymentStatus) {
      booking.paymentStatus = nextPaymentStatus;

      await this.bookingRepository.saveBooking(booking);
    }

    this.logger.log(
      `Booking ${booking.id} payment status synchronized to ${nextPaymentStatus}`,
    );

    return nextPaymentStatus;
  }

  private async handleRefundCreated(
    refund: RazorpayWebhookRefundEntity | undefined,
  ): Promise<void> {
    if (!refund?.id) {
      this.logger.warn('refund.created webhook does not contain a refund ID');

      return;
    }

    const refundPaymentId = this.getRefundPaymentId(refund);

    if (!refundPaymentId) {
      this.logger.warn(
        `Unable to resolve local refund payment for Razorpay refund ${refund.id}`,
      );

      return;
    }

    const refundPayment =
      await this.paymentRepository.findPaymentById(refundPaymentId);

    if (!refundPayment) {
      this.logger.warn(`Refund payment ${refundPaymentId} not found`);

      return;
    }

    if (refundPayment.paymentType !== PAYMENT_TYPE.CUSTOMER_REFUND) {
      this.logger.warn(`Payment ${refundPayment.id} is not a customer refund`);

      return;
    }

    /*
     * Do not downgrade an already successful refund
     * because webhook delivery order is not guaranteed.
     */
    if (refundPayment.status === PAYMENT_STATUS.SUCCESS) {
      return;
    }

    refundPayment.razorpayRefundId = refund.id;

    if (refund.payment_id) {
      refundPayment.razorpayPaymentId = refund.payment_id;
    }

    refundPayment.status = PAYMENT_STATUS.PENDING;

    refundPayment.failureReason = undefined;

    await this.paymentRepository.savePayment(refundPayment);

    this.logger.log(
      `Refund ${refund.id} created for local refund payment ${refundPayment.id}`,
    );
  }

  private async handleRefundProcessed(
    refund: RazorpayWebhookRefundEntity | undefined,
  ): Promise<void> {
    if (!refund?.id) {
      this.logger.warn('refund.processed webhook does not contain a refund ID');

      return;
    }

    const refundPaymentId = this.getRefundPaymentId(refund);

    let refundPayment: Payment | null = null;

    if (refundPaymentId) {
      refundPayment =
        await this.paymentRepository.findPaymentById(refundPaymentId);
    }

    if (!refundPayment) {
      refundPayment = await this.paymentRepository.findByRazorpayRefundId(
        refund.id,
      );
    }

    if (!refundPayment) {
      this.logger.warn(
        `Refund payment not found for Razorpay refund ${refund.id}`,
      );

      return;
    }

    if (refundPayment.paymentType !== PAYMENT_TYPE.CUSTOMER_REFUND) {
      this.logger.warn(`Payment ${refundPayment.id} is not a customer refund`);

      return;
    }

    /*
     * Process transactionally so duplicate webhooks
     * cannot update the same refund concurrently.
     */
    await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);

      const lockedRefundPayment = await paymentRepository
        .createQueryBuilder('payment')
        .where('payment.id = :paymentId', {
          paymentId: refundPayment.id,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!lockedRefundPayment) {
        return;
      }

      /*
       * Idempotent duplicate handling.
       */
      if (
        lockedRefundPayment.status === PAYMENT_STATUS.SUCCESS &&
        lockedRefundPayment.razorpayRefundId === refund.id
      ) {
        return;
      }

      lockedRefundPayment.razorpayRefundId = refund.id;

      if (refund.payment_id) {
        lockedRefundPayment.razorpayPaymentId = refund.payment_id;
      }

      lockedRefundPayment.status = PAYMENT_STATUS.SUCCESS;

      lockedRefundPayment.failureReason = undefined;

      lockedRefundPayment.paidAt = refund.created_at
        ? new Date(refund.created_at * 1000)
        : new Date();

      await paymentRepository.save(lockedRefundPayment);

      await this.auditLogService.createAuditLog(
        {
          actorId: null,
          actorType: ACTOR_TYPE.WEBHOOK,
          actorRole: undefined,
          module: AUDIT_MODULE.PAYMENT,
          entity: 'Payment',
          entityId: String(lockedRefundPayment.id),
          action: 'REFUND_SUCCESS',
          message: `Refund #${lockedRefundPayment.id} processed successfully via Razorpay Webhook.`,
          oldValue: { status: PAYMENT_STATUS.PENDING },
          newValue: {
            status: PAYMENT_STATUS.SUCCESS,
            razorpayRefundId: lockedRefundPayment.razorpayRefundId,
          },
        },
        manager,
      );
    });

    const originalRazorpayPaymentId =
      refund.payment_id ?? refundPayment.razorpayPaymentId;

    if (!originalRazorpayPaymentId) {
      this.logger.warn(
        `Original Razorpay payment ID is missing for refund ${refund.id}`,
      );

      return;
    }

    const originalPayment =
      await this.paymentRepository.findBookingPaymentByRazorpayPaymentId(
        originalRazorpayPaymentId,
      );

    if (!originalPayment) {
      this.logger.warn(
        `Original booking payment not found for Razorpay payment ${originalRazorpayPaymentId}`,
      );

      return;
    }

    const bookingPaymentStatus =
      await this.synchronizeBookingRefundStatus(originalPayment);

    this.logger.log(
      `Refund ${refund.id} processed successfully. Booking payment status: ${bookingPaymentStatus ?? 'not available'}`,
    );
  }

  private async handleRefundFailed(
    refund: RazorpayWebhookRefundEntity | undefined,
  ): Promise<void> {
    if (!refund?.id) {
      this.logger.warn('refund.failed webhook does not contain a refund ID');

      return;
    }

    const refundPaymentId = this.getRefundPaymentId(refund);

    let refundPayment: Payment | null = null;

    if (refundPaymentId) {
      refundPayment =
        await this.paymentRepository.findPaymentById(refundPaymentId);
    }

    if (!refundPayment) {
      refundPayment = await this.paymentRepository.findByRazorpayRefundId(
        refund.id,
      );
    }

    if (!refundPayment) {
      this.logger.warn(
        `Refund payment not found for failed Razorpay refund ${refund.id}`,
      );

      return;
    }

    if (refundPayment.paymentType !== PAYMENT_TYPE.CUSTOMER_REFUND) {
      this.logger.warn(`Payment ${refundPayment.id} is not a customer refund`);

      return;
    }

    /*
     * Never downgrade a refund that has already been
     * confirmed as successful.
     */
    if (refundPayment.status === PAYMENT_STATUS.SUCCESS) {
      return;
    }

    refundPayment.razorpayRefundId = refund.id;

    if (refund.payment_id) {
      refundPayment.razorpayPaymentId = refund.payment_id;
    }

    refundPayment.status = PAYMENT_STATUS.FAILED;

    refundPayment.failureReason =
      refund.error_description ?? refund.error_reason ?? 'Refund failed';

    await this.paymentRepository.savePayment(refundPayment);

    await this.auditLogService.createAuditLog({
      actorId: null,
      actorType: ACTOR_TYPE.SYSTEM,
      actorRole: undefined,
      module: AUDIT_MODULE.PAYMENT,
      entity: 'Payment',
      entityId: String(refundPayment.id),
      action: 'REFUND_FAILED',
      message: `Refund #${refundPayment.id} failed: ${refundPayment.failureReason}.`,
      oldValue: { status: PAYMENT_STATUS.PENDING },
      newValue: {
        status: refundPayment.status,
        failureReason: refundPayment.failureReason,
      },
    });

    /*
     * A failed refund does not make the original
     * payment unsuccessful. Synchronize in case an
     * earlier partial refund was already processed.
     */
    const originalRazorpayPaymentId =
      refund.payment_id ?? refundPayment.razorpayPaymentId;

    if (originalRazorpayPaymentId) {
      const originalPayment =
        await this.paymentRepository.findBookingPaymentByRazorpayPaymentId(
          originalRazorpayPaymentId,
        );

      if (originalPayment) {
        await this.synchronizeBookingRefundStatus(originalPayment);
      }
    }

    this.logger.error(
      `Refund ${refund.id} failed for local refund payment ${refundPayment.id}: ${refundPayment.failureReason}`,
    );
  }

  private async finalizeSuccessfulPayment(payment: Payment): Promise<void> {
    const wasBookingCompleted =
      payment.booking?.status === BOOKING_STATUS.COMPLETED;
    const wasPaymentPaid =
      payment.booking?.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
    let wasOrderAlreadyPaid = false;
    let newlyAssignedPurohitUserIds: number[] = [];

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Payment, payment);

      const bookingId = payment.bookingId ?? payment.booking?.id;
      if (bookingId && payment.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT) {
        const booking = await manager.getRepository(Booking).findOne({
          where: { id: bookingId },
          lock: { mode: 'pessimistic_write' },
        });

        if (booking) {
          // Idempotent calculation: sum all successful payments for this booking
          const successfulPayments = await manager.getRepository(Payment).find({
            where: {
              bookingId: booking.id,
              paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
              status: PAYMENT_STATUS.SUCCESS,
            },
          });

          const totalPaid = Number(
            successfulPayments
              .reduce((sum, p) => sum + Number(p.amount), 0)
              .toFixed(2),
          );

          const finalAmount = Number(booking.finalAmount ?? 0);
          const effectiveTokenPercentage =
            booking.tokenPercentage != null && Number(booking.tokenPercentage) > 0
              ? Number(booking.tokenPercentage)
              : 30;

          const tokenAmount =
            booking.tokenAmount != null
              ? Number(booking.tokenAmount)
              : Number(
                ((finalAmount * effectiveTokenPercentage) / 100).toFixed(2),
              );

          booking.paidAmount = totalPaid;
          booking.remainingAmount = Math.max(
            0,
            Number((finalAmount - totalPaid).toFixed(2)),
          );
          booking.bookingPaymentId = payment.id;

          if (totalPaid >= finalAmount) {
            booking.paymentStatus = BOOKING_PAYMENT_STATUS.PAID;
            // TODO: In legacy flow, bookings were marked COMPLETED upon payment.
            // In token payment flow, if booking was ONGOING, full settlement completes it.
            if (booking.status === BOOKING_STATUS.ONGOING) {
              booking.status = BOOKING_STATUS.COMPLETED;
              booking.completionConfirmedAt = new Date();
            }

            // Create real PUROHIT_PAYOUT record when booking is fully paid
            await this.ensurePurohitPendingPayout(manager, booking);
          } else if (totalPaid >= tokenAmount) {
            booking.paymentStatus = BOOKING_PAYMENT_STATUS.PARTIAL;
          } else {
            booking.paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
          }

          // TOKEN PAYMENT GATE: Trigger AUTO assignment only when token (or full) payment is confirmed (or deferred for admin)
          // TODO: Deprecated. Admin-created bookings now use DEFERRED payment type instead of NOT_REQUIRED status.
          // const isEligibleForAssignment =
          //   (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
          //     booking.paymentStatus === BOOKING_PAYMENT_STATUS.PARTIAL ||
          //     booking.paymentStatus === BOOKING_PAYMENT_STATUS.NOT_REQUIRED) &&
          //   booking.status === BOOKING_STATUS.PENDING &&
          //   !booking.purohitId;
          const isEligibleForAssignment =
            (booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ||
              booking.paymentStatus === BOOKING_PAYMENT_STATUS.PARTIAL ||
              booking.paymentType === BOOKING_PAYMENT_TYPE.DEFERRED) &&
            booking.status === BOOKING_STATUS.PENDING &&
            !booking.purohitId;

          if (
            isEligibleForAssignment &&
            (!booking.filteredPurohitIds || booking.filteredPurohitIds.length === 0)
          ) {
            if (this.assignmentService) {
              const eligiblePurohitIds =
                await this.assignmentService.findEligiblePurohitIds(
                  manager,
                  booking,
                );
              booking.filteredPurohitIds = eligiblePurohitIds;
              booking.assignmentType = ASSIGNMENT_TYPE.AUTO;

              if (eligiblePurohitIds.length > 0) {
                const purohitProfiles = await manager
                  .getRepository(PurohitProfile)
                  .createQueryBuilder('profile')
                  .select(['profile.id', 'profile.userId'])
                  .where('profile.id IN (:...purohitProfileIds)', {
                    purohitProfileIds: eligiblePurohitIds,
                  })
                  .getMany();

                newlyAssignedPurohitUserIds = purohitProfiles.map(
                  (p) => p.userId,
                );
              }
            }
          }

          await manager.save(Booking, booking);
          payment.booking = booking;
        }
      }

      // Safe, idempotent cart clearing and BookingProduct synchronization
      const bookingProductRepo = manager.getRepository(BookingProduct);
      const cartRepo = manager.getRepository(Cart);
      const cartItemRepo = manager.getRepository(CartItem);

      // Link any unlinked BookingProduct records for this booking/customer to this payment
      if (payment.bookingId && payment.payerId) {
        await bookingProductRepo
          .createQueryBuilder()
          .update(BookingProduct)
          .set({ paymentId: payment.id })
          .where(
            'customerId = :customerId AND bookingId = :bookingId AND paymentId IS NULL',
            {
              customerId: payment.payerId,
              bookingId: payment.bookingId,
            },
          )
          .execute();
      }

      // Find purchased products linked to this payment
      const purchasedProducts = await bookingProductRepo.find({
        where: { paymentId: payment.id },
      });

      if (payment.payerId && purchasedProducts.length > 0) {
        const customerCart = await cartRepo.findOne({
          where: { customerId: payment.payerId },
        });

        if (customerCart) {
          // Safe removal: only remove the items that were actually purchased
          for (const purchased of purchasedProducts) {
            const cartItem = await cartItemRepo.findOne({
              where: {
                cartId: customerCart.id,
                productId: purchased.productId,
              },
            });
            if (cartItem) {
              if (cartItem.quantity <= purchased.quantity) {
                await cartItemRepo.delete(cartItem.id);
              } else {
                cartItem.quantity -= purchased.quantity;
                await cartItemRepo.save(cartItem);
              }
            }
          }
        }
      }

      // PRODUCT_PAYMENT: Update Order to PAID & CONFIRMED, and clear cart
      if (payment.paymentType === PAYMENT_TYPE.PRODUCT_PAYMENT) {
        const orderRepo = manager.getRepository(Order);
        let order = await orderRepo.findOne({
          where: { paymentId: payment.id },
        });

        const paymentNotes = (payment as any).notes;
        if (!order && paymentNotes?.orderId) {
          const parsedOrderId = Number(paymentNotes.orderId);
          if (!isNaN(parsedOrderId)) {
            order = await orderRepo.findOne({ where: { id: parsedOrderId } });
            if (order) {
              order.paymentId = payment.id;
            }
          }
        }

        if (!order && paymentNotes?.orderNumber) {
          order = await orderRepo.findOne({
            where: { orderNumber: String(paymentNotes.orderNumber) },
          });
          if (order) {
            order.paymentId = payment.id;
          }
        }

        if (order) {
          if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
            wasOrderAlreadyPaid = true;
          } else {
            order.paymentStatus = ORDER_PAYMENT_STATUS.PAID;
            if (
              order.orderStatus === ORDER_STATUS.PENDING_PAYMENT ||
              order.orderStatus === ORDER_STATUS.EXPIRED
            ) {
              order.orderStatus = ORDER_STATUS.CONFIRMED;
            }
            await orderRepo.save(order);
          }
        }

        // Safe, idempotent cart clearing upon payment confirmation
        const payerId = payment.payerId || order?.customerId;
        if (payerId) {
          const customerCart = await cartRepo.findOne({
            where: { customerId: payerId },
          });
          if (customerCart) {
            await cartItemRepo.delete({ cartId: customerCart.id });
          }
        }
      }
    });

    if (
      payment.paymentType === PAYMENT_TYPE.PRODUCT_PAYMENT &&
      !wasOrderAlreadyPaid
    ) {
      try {
        const orderRepo = this.dataSource.getRepository(Order);
        let order = await orderRepo.findOne({
          where: { paymentId: payment.id },
        });

        if (!order && (payment as any).notes?.['orderId']) {
          const parsedOrderId = Number((payment as any).notes['orderId']);
          if (!isNaN(parsedOrderId)) {
            order = await orderRepo.findOne({ where: { id: parsedOrderId } });
          }
        }

        if (!order && (payment as any).notes?.['orderNumber']) {
          order = await orderRepo.findOne({
            where: { orderNumber: String((payment as any).notes['orderNumber']) },
          });
        }

        const orderNumber = order?.orderNumber || String(payment.id);
        const orderCode = order?.id ? `ORD-${order.id}` : `#${orderNumber}`;
        const payerId = payment.payerId || order?.customerId;

        const userRepo = this.dataSource.getRepository(User);
        const payer = payerId
          ? await userRepo.findOne({
            where: { id: payerId },
          })
          : null;
        const customerName =
          [payer?.firstName, payer?.lastName].filter(Boolean).join(' ') ||
          'Customer';
        const paymentReference = payment.razorpayPaymentId || `PAY-${payment.id}`;

        if (payerId) {
          await this.notificationService.createNotification(
            payerId,
            'Payment Successful',
            `Your payment of ₹${payment.amount} for Order ${orderCode} was successful. Payment ID: ${paymentReference}.`,
            NOTIFICATION_TYPE.PAYMENT,
            order?.id || payment.id,
            'ORDER',
          );
        }

        // Real-time Socket.IO and DB notification for Admin on Payment Success / Repayment Success
        const isRepay = payment.remark?.toLowerCase().includes('retry') || false;
        const adminTitle = isRepay
          ? 'Order Repayment Received'
          : 'Order Payment Received';
        const adminMessage = isRepay
          ? `Order Repayment Successful — Order ${orderCode} has been successfully repaid by ${customerName}. Payment ID: ${paymentReference}. Amount: ₹${payment.amount}.`
          : `Order Payment Successful — Order ${orderCode} has been successfully paid by ${customerName}. Payment ID: ${paymentReference}. Amount: ₹${payment.amount}.`;

        await this.notificationService.notifyAdmins(
          adminTitle,
          adminMessage,
          NOTIFICATION_TYPE.PAYMENT,
          order?.id || payment.id,
          'ORDER',
          {
            orderId: order?.id,
            orderCode,
            orderNumber: order?.orderNumber || orderCode,
            customerId: payerId,
            customerName,
            paymentId: payment.id,
            razorpayPaymentId: payment.razorpayPaymentId,
            paymentReference,
            amount: payment.amount,
            status: 'PAID',
            paymentStatus: ORDER_PAYMENT_STATUS.PAID,
            isRepay,
            isRetry: isRepay,
          },
        );

        if (this.emailService && payer?.email) {
          const paidAmountVal = payment.customerPaidAmount ?? payment.amount;
          const html = renderPoojawalaEmail({
            statusBadge: 'Payment Successful',
            userName: customerName,
            preheaderText: `Payment confirmed for Order ORD-${orderCode}!`,
            emailMessage: `We have received your payment of <strong>₹${paidAmountVal}</strong> for Order <strong>#${orderCode}</strong>. Your order is confirmed and will be processed soon.`,
            detailsTable: {
              title: 'Payment Receipt',
              rows: [
                { label: 'Order ID', value: `${orderCode}` },
                { label: 'Payment ID', value: String(payment.id) },
                {
                  label: 'Payment Method',
                  value: payment.paymentMethod || 'ONLINE',
                },
                {
                  label: 'Amount Paid',
                  value: `₹${paidAmountVal}`,
                  isHighlight: true,
                },
                { label: 'Payment Status', value: 'PAID' },
                { label: 'Order Status', value: 'CONFIRMED' },
              ],
              totalRow: {
                label: 'Total Paid',
                value: `₹${paidAmountVal}`,
              },
            },
          });

          await this.emailService.sendMail({
            to: payer.email,
            subject: `Payment Successful - Poojawala | Order ${orderCode}`,
            html,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not send payment notification/email: ${err?.message}`);
      }
    }

    if (payment.booking && payment.paymentType === PAYMENT_TYPE.BOOKING_PAYMENT) {
      const remaining = Number(payment.booking.remainingAmount ?? 0);
      const notificationMsg =
        remaining > 0
          ? `Your payment for Booking #${payment.booking.bookingNumber} was successful. Paid: ₹${payment.amount}, Remaining: ₹${remaining}.`
          : `Your payment for Booking #${payment.booking.bookingNumber} was successful. Paid: ₹${payment.amount}, Remaining: ₹0.`;

      await this.notificationService.createNotification(
        payment.booking.customerId,
        'Payment Successful',
        notificationMsg,
        NOTIFICATION_TYPE.PAYMENT,
        payment.id,
        'PAYMENT',
      );

      // Notify Admin on Booking Payment Success
      const bookingCustomer = payment.booking.customer;
      const bookingCustomerName =
        [bookingCustomer?.firstName, bookingCustomer?.lastName].filter(Boolean).join(' ') ||
        'Customer';
      await this.notificationService.notifyAdmins(
        'Booking Payment Received',
        `Booking Payment Successful — Booking #${payment.booking.bookingNumber} has been successfully paid by ${bookingCustomerName}. Payment ID: ${payment.razorpayPaymentId || `PAY-${payment.id}`}. Amount: ₹${payment.amount}.`,
        NOTIFICATION_TYPE.PAYMENT,
        payment.booking.id,
        'BOOKING',
        {
          bookingId: payment.booking.id,
          bookingNumber: payment.booking.bookingNumber,
          customerId: payment.booking.customerId,
          customerName: bookingCustomerName,
          paymentId: payment.id,
          razorpayPaymentId: payment.razorpayPaymentId,
          amount: payment.amount,
          status: 'PAID',
        },
      );

      if (newlyAssignedPurohitUserIds.length > 0) {
        for (const purohitUserId of newlyAssignedPurohitUserIds) {
          try {
            await this.notificationService.createNotification(
              purohitUserId,
              'New Booking',
              `You have received a new booking request (Booking B-${payment.booking.id}).`,
              NOTIFICATION_TYPE.BOOKING,
              payment.booking.id,
              'BOOKING',
            );
          } catch (notifyErr: any) {
            this.logger.warn(
              `Failed to notify Purohit ${purohitUserId}: ${notifyErr?.message}`,
            );
          }
        }
      }

      if (!wasBookingCompleted) {
        this.bookingGateway.notifyUser(
          payment.booking.customerId,
          'booking_status_updated',
          {
            message: `Booking status updated to ${payment.booking.status}`,
            booking: payment.booking,
          },
        );

        await this.notificationService.createNotification(
          payment.booking.customerId,
          'Booking Status Updated',
          `Your booking B-${payment.booking.id} status has been updated to ${payment.booking.status}.`,
          NOTIFICATION_TYPE.BOOKING_STATUS,
          payment.booking.id,
          'BOOKING',
        );

        if (this.emailService) {
          try {
            const fullBooking = await this.bookingRepository.findBookingById(
              payment.booking.id,
            );
            if (fullBooking?.customer?.email) {
              const customerName = fullBooking.customer.firstName
                ? `${fullBooking.customer.firstName} ${fullBooking.customer.lastName || ''}`.trim()
                : 'Devotee';
              const purohitUser = fullBooking.purohit?.user;
              const purohitName = purohitUser?.firstName
                ? `${purohitUser.firstName} ${purohitUser.lastName || ''}`.trim()
                : 'Assigned Purohit';
              const bookingDate = fullBooking.scheduledAt
                ? new Date(fullBooking.scheduledAt).toLocaleDateString(
                  'en-IN',
                  {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  },
                )
                : 'Scheduled Date';
              const bookingTime = fullBooking.scheduledAt
                ? new Date(fullBooking.scheduledAt).toLocaleTimeString(
                  'en-IN',
                  {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  },
                )
                : 'Scheduled Time';

              this.logger.log(
                `[BookingEmail] Sending booking completed email to customer for booking #${fullBooking.bookingNumber}...`,
              );
              await this.emailService.sendCustomerBookingCompletedEmail({
                email: fullBooking.customer.email,
                customerName,
                bookingId: fullBooking.bookingNumber || `B-${fullBooking.id}`,
                serviceName: fullBooking.service?.name || 'Vedic Pooja',
                servicePlan: fullBooking.plan ? String(fullBooking.plan) : undefined,
                planName: fullBooking.plan ? String(fullBooking.plan) : undefined,
                bookingDate,
                bookingTime,
                purohitName,
                totalAmount:
                  Number(fullBooking.finalAmount) ||
                  Number(payment.amount) ||
                  0,
                paymentStatus: fullBooking.paymentStatus || 'PAID',
              });
              this.logger.log(
                `[BookingEmail] Customer booking completed email sent successfully for booking #${fullBooking.bookingNumber}.`,
              );
            }
          } catch (emailErr) {
            this.logger.error(
              `[BookingEmail] Failed to send customer booking completed email for booking #${payment.booking.bookingNumber}`,
              emailErr instanceof Error ? emailErr.stack : String(emailErr),
            );
          }
        }
      }

      if (payment.booking.purohitId) {
        const purohitProfile = await this.dataSource
          .getRepository(PurohitProfile)
          .findOne({
            where: { id: payment.booking.purohitId },
          });

        if (purohitProfile) {
          if (!wasPaymentPaid) {
            await this.notificationService.createNotification(
              purohitProfile.userId,
              'Payment Successful',
              `The customer has paid for Booking #${payment.booking.bookingNumber}.`,
              NOTIFICATION_TYPE.PAYMENT,
              payment.id,
              'PAYMENT',
            );
          }

          if (!wasBookingCompleted) {
            this.bookingGateway.notifyUser(
              purohitProfile.userId,
              'booking_status_updated',
              {
                message: `Booking status updated to ${payment.booking.status}`,
                booking: payment.booking,
              },
            );

            await this.notificationService.createNotification(
              purohitProfile.userId,
              'Booking Status Updated',
              `Booking B-${payment.booking.id} status has been updated to ${payment.booking.status}.`,
              NOTIFICATION_TYPE.BOOKING_STATUS,
              payment.booking.id,
              'BOOKING',
            );
          }
        }
      }
    }
  }

  async ensurePurohitPendingPayout(
    manager: EntityManager,
    booking: Booking,
  ): Promise<Payment | null> {
    // 1. Booking customer payment status is PAID
    if (booking.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID) {
      return null;
    }

    // 2. Booking remainingAmount is <= 0 OR null
    if (
      booking.remainingAmount != null &&
      Number(booking.remainingAmount) > 0
    ) {
      return null;
    }

    // 3. booking.purohitPayoutAmount is available and greater than 0
    const payoutAmount = Number(booking.purohitPayoutAmount);
    if (!payoutAmount || payoutAmount <= 0) {
      return null;
    }

    // 5. Purohit payout has not already been marked PAID
    if (booking.purohitPayoutStatus === BOOKING_PAYMENT_STATUS.PAID) {
      return null;
    }

    const paymentRepo = manager.getRepository(Payment);
    const bkRepo = manager.getRepository(Booking);

    // 4. No existing PUROHIT_PAYOUT payment is already linked to this booking
    // Verify inside transaction for idempotency / duplicate protection
    const existingPayout = await paymentRepo.findOne({
      where: [
        ...(booking.purohitPaymentId
          ? [{ id: booking.purohitPaymentId, paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT }]
          : []),
        {
          bookingId: booking.id,
          paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT,
        },
      ],
    });

    if (existingPayout) {
      // Reuse existing payout instead of creating another one
      if (booking.purohitPaymentId !== existingPayout.id) {
        booking.purohitPaymentId = existingPayout.id;
        booking.purohitPayoutStatus =
          existingPayout.status === PAYMENT_STATUS.SUCCESS
            ? BOOKING_PAYMENT_STATUS.PAID
            : BOOKING_PAYMENT_STATUS.PENDING;
        await bkRepo.save(booking);
      }
      return existingPayout;
    }

    // Resolve payeeId (Purohit user ID)
    let payeeId: number | undefined = booking.purohit?.userId;
    if (!payeeId && booking.purohitId) {
      const profile = await manager.getRepository(PurohitProfile).findOne({
        where: { id: booking.purohitId },
        select: ['id', 'userId'],
      });
      payeeId = profile?.userId;
    }

    // Create exactly ONE PUROHIT_PAYOUT record with PENDING status
    let createdPayout = paymentRepo.create({
      paymentType: PAYMENT_TYPE.PUROHIT_PAYOUT,
      bookingId: booking.id,
      payeeId,
      createdById: booking.customerId || 1,
      amount: payoutAmount,
      currency: 'INR',
      status: PAYMENT_STATUS.PENDING,
      remark: `Purohit payout pending for Booking #${booking.bookingNumber || booking.id}`,
    });

    createdPayout = await paymentRepo.save(createdPayout);

    booking.purohitPaymentId = createdPayout.id;
    booking.purohitPayoutStatus = BOOKING_PAYMENT_STATUS.PENDING;
    await bkRepo.save(booking);

    return createdPayout;
  }

  private async ensurePendingPayoutsForPurohit(userId: number): Promise<void> {
    try {
      if (typeof this.bookingRepository.createQueryBuilder !== 'function') {
        return;
      }
      const eligibleBookings = await this.bookingRepository
        .createQueryBuilder('booking')
        .leftJoin('booking.purohit', 'purohit')
        .where('purohit.userId = :userId', { userId })
        .andWhere('booking.paymentStatus = :paidStatus', {
          paidStatus: BOOKING_PAYMENT_STATUS.PAID,
        })
        .andWhere(
          '(booking.remainingAmount <= 0 OR booking.remainingAmount IS NULL)',
        )
        .andWhere('booking.purohitPayoutAmount > 0')
        .andWhere('booking.purohitPayoutStatus != :payoutPaidStatus', {
          payoutPaidStatus: BOOKING_PAYMENT_STATUS.PAID,
        })
        .getMany();

      for (const booking of eligibleBookings) {
        await this.dataSource.transaction(async (manager) => {
          const lockedBooking = await manager.getRepository(Booking).findOne({
            where: { id: booking.id },
            lock: { mode: 'pessimistic_write' },
            relations: { purohit: true },
          });
          if (lockedBooking) {
            await this.ensurePurohitPendingPayout(manager, lockedBooking);
          }
        });
      }
    } catch (err) {
      // TODO: Replaced string interpolation which could result in [object Object]
      // this.logger.warn(
      //   `Failed to ensure pending payouts for purohit ${userId}: ${err}`,
      // );
      this.logger.warn(
        `Failed to ensure pending payouts for purohit ${userId}: ${this.formatRazorpayError(err)}`,
      );
    }
  }

  async getAllPurohitPayouts(query: any) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);

    const bookingRepo = this.dataSource.getRepository(Booking);

    const qb = bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .leftJoinAndSelect(
        'booking.payments',
        'payments',
        'payments.paymentType = :payoutType',
        { payoutType: PAYMENT_TYPE.PUROHIT_PAYOUT },
      )
      .where('booking.purohitId IS NOT NULL')
      .orderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    qb.andWhere('booking.purohitPayoutStatus = :purohitPayoutStatus', {
      purohitPayoutStatus: BOOKING_PAYMENT_STATUS.PAID,
    });

    const [bookings, total] = await qb.getManyAndCount();

    const items = bookings.map((booking) => {
      const payoutPayment = booking.payments?.[0];
      return {
        paymentId: payoutPayment ? payoutPayment.id : null,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        purohitPayoutDate: payoutPayment
          ? (payoutPayment.paidAt ?? payoutPayment.createdAt)
          : null,
        purohitPayoutStatus: booking.purohitPayoutStatus,
        purohitName: booking.purohit?.user
          ? `${booking.purohit.user.firstName} ${booking.purohit.user.lastName}`.trim()
          : null,
        finalAmount: booking.finalAmount,
        payoutAmount: booking.purohitPayoutAmount,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPurohitPayoutFinanceStats() {
    const bookingRepo = this.dataSource.getRepository(Booking);

    const { totalRevenue } = await bookingRepo
      .createQueryBuilder('booking')
      .select('SUM(booking.finalAmount)', 'totalRevenue')
      .where('booking.paymentStatus = :status', {
        status: BOOKING_PAYMENT_STATUS.PAID,
      })
      .getRawOne();

    const { purohitPayoutsAmount } = await bookingRepo
      .createQueryBuilder('booking')
      .select('SUM(booking.purohitPayoutAmount)', 'purohitPayoutsAmount')
      .where('booking.purohitPayoutStatus = :status', {
        status: BOOKING_PAYMENT_STATUS.PAID,
      })
      .getRawOne();

    const pendingPayoutsNumber = await bookingRepo
      .createQueryBuilder('booking')
      .where('booking.paymentStatus = :paymentStatus', {
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
      })
      .andWhere('booking.purohitPayoutStatus = :payoutStatus', {
        payoutStatus: BOOKING_PAYMENT_STATUS.PENDING,
      })
      .andWhere('booking.purohitId IS NOT NULL')
      .getCount();

    const successfulPayoutsNumber = await bookingRepo
      .createQueryBuilder('booking')
      .where('booking.purohitPayoutStatus = :payoutStatus', {
        payoutStatus: BOOKING_PAYMENT_STATUS.PAID,
      })
      .andWhere('booking.purohitId IS NOT NULL')
      .getCount();

    return {
      totalRevenue: Number(totalRevenue) || 0,
      purohitPayoutsAmount: Number(purohitPayoutsAmount) || 0,
      pendingPayoutsNumber,
      successfulPayoutsNumber,
    };
  }

  private async notifyAndEmailProductPaymentFailure(
    payment: Payment,
    reason?: string,
  ): Promise<void> {
    if (payment.paymentType !== PAYMENT_TYPE.PRODUCT_PAYMENT || !payment.payerId) {
      return;
    }

    try {
      const order = await this.dataSource
        .getRepository(Order)
        .findOne({ where: { paymentId: payment.id } });
      const orderNumber = order?.orderNumber || String(payment.id);

      // Notification
      await this.notificationService.createNotification(
        payment.payerId,
        'Payment Failed',
        `Payment of ₹${payment.amount} for Order #${orderNumber} failed. Reason: ${reason || payment.failureReason || 'Declined'}. You can retry from your cart or orders.`,
        NOTIFICATION_TYPE.PAYMENT,
        order?.id || payment.id,
        'ORDER',
      );

      // Email
      if (this.emailService) {
        const userRepo = this.dataSource.getRepository(User);
        const payer = await userRepo.findOne({ where: { id: payment.payerId } });
        if (payer?.email) {
          const customerName =
            [payer.firstName, payer.lastName].filter(Boolean).join(' ') ||
            'Devotee';
          const html = renderPoojawalaEmail({
            statusBadge: 'Payment Failed',
            userName: customerName,
            preheaderText: `Payment failed for Order #${orderNumber}`,
            emailMessage: `Your payment of <strong>₹${payment.amount}</strong> for Order <strong>#${orderNumber}</strong> was not successful. Reason: ${reason || payment.failureReason || 'Transaction could not be completed'}. Your cart items remain saved so you can retry whenever you are ready.`,
            detailsTable: {
              title: 'Transaction Details',
              rows: [
                { label: 'Order Number', value: `#${orderNumber}` },
                { label: 'Amount', value: `₹${payment.amount}` },
                { label: 'Payment Status', value: 'FAILED', isHighlight: true },
                {
                  label: 'Reason',
                  value: reason || payment.failureReason || 'Payment failed',
                },
              ],
            },
            highlight: {
              title: 'Retry Your Payment',
              text: 'You can retry payment anytime by visiting your orders or cart on the PoojaWala app/website.',
            },
          });

          await this.emailService.sendMail({
            to: payer.email,
            subject: `Payment Failed - Poojawala | Order #${orderNumber}`,
            html,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to send payment failure notification/email: ${err?.message}`,
      );
    }
  }

  /**
   * Retries/initiates payment for an existing unpaid order.
   * Validates customer ownership, order status, non-expired window,
   * generates a new payment attempt record, and produces a Razorpay checkout payment link.
   */
  async createOrderPaymentRetry(user: User, orderId: number) {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can retry payment for an order');
    }

    const orderRepo = this.dataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { id: orderId, customerId: user.id },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
      throw new BadRequestException('This order has already been paid');
    }

    if (order.orderStatus === ORDER_STATUS.CANCELLED) {
      throw new BadRequestException('Cannot retry payment for a cancelled order');
    }

    if (
      order.orderStatus === ORDER_STATUS.EXPIRED ||
      (order.expiredAt && new Date(order.expiredAt).getTime() <= Date.now())
    ) {
      if (order.orderStatus !== ORDER_STATUS.EXPIRED) {
        order.orderStatus = ORDER_STATUS.EXPIRED;
        if (!order.expiredAt) {
          order.expiredAt = new Date();
        }
        await orderRepo.save(order);
      }
      throw new BadRequestException(
        'This order has expired. Please place a new order.',
      );
    }

    if (order.orderStatus !== ORDER_STATUS.PENDING_PAYMENT) {
      throw new BadRequestException('This order is not eligible for payment');
    }

    const totalAmount = Number(order.totalAmount);
    const amountInPaise = Math.round(totalAmount * 100);

    const savedPayment = await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const oRepo = manager.getRepository(Order);

      const payment = paymentRepo.create({
        paymentType: PAYMENT_TYPE.PRODUCT_PAYMENT,
        createdById: user.id,
        payerId: user.id,
        amount: totalAmount,
        currency: 'INR',
        customerPaymentMethod: CUSTOMER_PAYMENT_METHOD.ONLINE,
        status: PAYMENT_STATUS.CREATED,
        remark: `Payment retry for Order ORD-${order.id}`,
      });

      const newPayment = await paymentRepo.save(payment);

      order.paymentId = newPayment.id;
      order.paymentStatus = ORDER_PAYMENT_STATUS.PENDING;
      // NOTE: order.expiredAt MUST REMAIN UNCHANGED
      await oRepo.save(order);

      return newPayment;
    });

    if (this.auditLogService) {
      try {
        await this.auditLogService.createAuditLog({
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.PAYMENT,
          entity: 'Order',
          entityId: String(order.id),
          action: 'ORDER_PAYMENT_RETRY_INITIATED',
          message: `Customer initiated payment retry for Order ORD-${order.id}.`,
          newValue: {
            paymentId: savedPayment.id,
            amount: totalAmount,
            status: savedPayment.status,
          },
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentId: savedPayment.id,
            amount: totalAmount,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to create payment retry audit: ${err?.message}`);
      }
    }

    const customerName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Customer';

    const paymentLink = await this.createRazorpayPaymentLink(
      savedPayment,
      null,
      {
        name: customerName,
        ...(user.email ? { email: user.email } : {}),
        ...(user.phone ? { contact: user.phone } : {}),
      },
      `Poojawala Order #${order.orderNumber}`,
      {
        paymentId: String(savedPayment.id),
        customerId: String(user.id),
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        paymentType: String(savedPayment.paymentType),
        isCartCheckout: 'true',
      },
    );

    // ── Notify customer & admin about the payment link initiation ──────────
    const orderCode = `ORD-${order.id}`;
    const paymentReference = `PAY-${savedPayment.id}`;

    try {
      // Customer: payment link is ready
      await this.notificationService.createNotification(
        user.id,
        'Payment Link Generated',
        `Your payment link for Order ${orderCode} is ready. Amount: ₹${totalAmount}. Please complete your payment before it expires.`,
        NOTIFICATION_TYPE.PAYMENT,
        order.id,
        'ORDER',
      );

      // Admin: customer initiated a payment retry / repay
      await this.notificationService.notifyAdmins(
        'Order Repayment Initiated',
        `${customerName} has initiated payment retry for Order ${orderCode}. Amount: ₹${totalAmount}. Payment Ref: ${paymentReference}.`,
        NOTIFICATION_TYPE.PAYMENT,
        order.id,
        'ORDER',
        {
          orderId: order.id,
          orderCode,
          orderNumber: order.orderNumber,
          customerId: user.id,
          customerName,
          paymentId: savedPayment.id,
          paymentReference,
          amount: totalAmount,
          status: 'INITIATED',
          isRepay: true,
          isRetry: true,
          action: 'ORDER_REPAY_INITIATED',
        },
      );

      // Customer: email with clickable payment link
      if (this.emailService && user.email) {
        const html = renderPoojawalaEmail({
          statusBadge: 'Payment Link Ready',
          userName: customerName,
          preheaderText: `Complete your payment for Order ${orderCode}`,
          emailMessage: `Your payment link for Order <strong>${orderCode}</strong> has been generated. Please click the button below to complete your payment of <strong>₹${totalAmount}</strong> before it expires.`,
          detailsTable: {
            title: 'Order Payment Details',
            rows: [
              { label: 'Order ID', value: orderCode },
              { label: 'Payment Ref', value: paymentReference },
              { label: 'Amount Due', value: `₹${totalAmount}`, isHighlight: true },
              {
                label: 'Payment Link',
                value: paymentLink.short_url,
                link: paymentLink.short_url,
                linkText: 'Click here to pay →',
              },
            ],
          },
          highlight: {
            title: 'Complete Your Payment',
            text: 'This payment link is time-sensitive. Please complete your payment soon to confirm your order.',
          },
          additionalContentHtml: `
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 8px;">
              <tr>
                <td align="center">
                  <a href="${paymentLink.short_url}"
                     target="_blank"
                     rel="noopener noreferrer"
                     style="
                       display: inline-block;
                       background: linear-gradient(135deg, #FF6200 0%, #D32F2F 100%);
                       color: #ffffff;
                       font-family: 'Outfit', Arial, sans-serif;
                       font-size: 16px;
                       font-weight: 700;
                       text-decoration: none;
                       padding: 14px 40px;
                       border-radius: 50px;
                       letter-spacing: 0.5px;
                       box-shadow: 0 4px 14px rgba(255, 98, 0, 0.35);
                     ">
                    💳 Pay ₹${totalAmount} Now
                  </a>
                </td>
              </tr>
            </table>
          `,
        });

        await this.emailService.sendMail({
          to: user.email,
          subject: `Payment Link Ready - Poojawala | Order ${orderCode}`,
          html,
        });
      }

    } catch (notifyErr: any) {
      this.logger.warn(
        `[OrderPaymentRetry] Failed to send initiation notifications for Order ${order.id}: ${notifyErr?.message}`,
      );
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      paymentId: savedPayment.id,
      paymentUrl: paymentLink.short_url,
      amount: totalAmount,
      amountInPaise,
      currency: 'INR',
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      expiredAt: order.expiredAt ?? null,
      status: savedPayment.status,
    };
  }
}
