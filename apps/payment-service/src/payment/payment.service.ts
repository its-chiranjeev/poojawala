import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';
import { DataSource } from 'typeorm';

import {
  Booking,
  BOOKING_PAYMENT_STATUS,
  BOOKING_STATUS,
  PaymentBooking,
  Payment,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  User,
  USER_ROLE,
} from '@likemyproduct/entities';

import {
  BookingRepository,
  PaymentRepository,
} from '@likemyproduct/repositories';

import {
  CreatePaymentLinkDto,
  PaymentQueryDto,
  AdminPaymentQueryDto,
  CreateRefundDto,
} from '@likemyproduct/dtos';

import { paymentInvoiceTemplate } from './templates/invoice.template';

interface RazorpayError {
  error?: {
    description?: string;
  };

  message?: string;
}

interface PaymentLinkCustomer {
  name: string;
  email?: string;
  contact?: string;
}

interface RazorpayPaymentLinkData {
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
  notes: Record<string, unknown> | null;
  providerCreatedAt: Date | null;
}

export interface PaymentDetailsResponse {
  id: number;
  paymentType: PAYMENT_TYPE;
  bookingId: number | null;

  linkedBookings: Array<{
    id: number;
    bookingNumber?: string;
  }>;

  createdById: number;
  payerId: number | null;
  payeeId: number | null;

  amount: number;
  currency: string;

  status: PAYMENT_STATUS;
  providerStatus: string | null;
  paymentMethod: PAYMENT_METHOD | null;

  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpayRefundId: string | null;

  bankTransferReference: string | null;
  failureReason: string | null;

  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  providerDetails: PaymentProviderDetails | null;
  razorpayRaw: RazorpayPaymentData | null;

  source: 'RAZORPAY_WITH_DB_FALLBACK' | 'DATABASE_ONLY';
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
}

export interface RazorpayWebhookPaymentEntity {
  id: string;
  order_id?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  method?: string;
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
  private readonly razorpay: Razorpay;

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly dataSource: DataSource,
  ) {
    const keyId = process.env['RAZORPAY_KEY_ID'];
    const keySecret = process.env['RAZORPAY_KEY_SECRET'];

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials are not configured');
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
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

    const amount = this.getBookingAmount(booking);

    // Add duplicate active payment check here
    const existingPayment =
      await this.paymentRepository.findActivePaymentByBookingId(booking.id);

    if (existingPayment) {
      throw new ConflictException(
        existingPayment.status === PAYMENT_STATUS.SUCCESS
          ? 'This booking is already paid'
          : 'An active payment already exists for this booking',
      );
    }

    // Create the new payment only after the check passes
    const savedPayment = await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);

      const paymentBookingRepository = manager.getRepository(PaymentBooking);

      const payment = paymentRepository.create({
        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
        bookingId: booking.id,
        createdById: user.id,
        payerId: user.id,
        payeeId: booking.purohit?.userId,
        amount,
        currency: 'INR',
        status: PAYMENT_STATUS.PENDING,
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
        dto.callbackUrl,
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
    if (booking.customerId !== user.id) {
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

  private getBookingAmount(booking: Booking): number {
    const amount = Number(booking.finalAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid booking amount');
    }

    return amount;
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

  private async createRazorpayPaymentLink(
    payment: Payment,
    booking: Booking,
    customer: PaymentLinkCustomer,
    description?: string,
    customCallbackUrl?: string,
  ): Promise<RazorpayPaymentLinkData> {
    const amountInPaise = Math.round(Number(payment.amount) * 100);

    const callbackUrl =
      customCallbackUrl?.trim() ||
      process.env['FRONTEND_PAYMENT_CALLBACK_URL']?.trim();

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
          description?.trim() || `Payment for booking ${booking.bookingNumber}`,

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

          bookingId: String(booking.id),

          bookingNumber: booking.bookingNumber,
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

    await this.paymentRepository.savePayment(payment);

    if (payment.booking) {
      payment.booking.paymentStatus = BOOKING_PAYMENT_STATUS.PAID;

      await this.bookingRepository.saveBooking(payment.booking);
    }

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
      return;
    }

    payment.status = PAYMENT_STATUS.SUCCESS;

    payment.razorpayPaymentId = razorpayPayment.id;

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

    await this.paymentRepository.savePayment(payment);

    if (payment.booking) {
      payment.booking.paymentStatus = BOOKING_PAYMENT_STATUS.PAID;

      await this.bookingRepository.saveBooking(payment.booking);
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

    payment.failureReason =
      razorpayPayment.error_description ?? 'Payment failed';

    await this.paymentRepository.savePayment(payment);
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

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    this.validatePaymentViewAccess(user, payment);

    const razorpayPayment = await this.resolveRazorpayPayment(payment);

    return this.buildCombinedPaymentResponse(payment, razorpayPayment);
  }

  private validatePaymentViewAccess(user: User, payment: Payment): void {
    if (user.role === USER_ROLE.ADMIN) {
      return;
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

    return Promise.all(
      payments.map(async (payment) => {
        const razorpayPayment = await this.resolveRazorpayPayment(payment);

        return this.buildCombinedPaymentResponse(payment, razorpayPayment);
      }),
    );
  }

  async getMyPayments(
    user: User,
    query: PaymentQueryDto,
  ): Promise<PaginatedPaymentsResponse> {
    const page = Math.max(Number(query.page ?? 1), 1);

    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);

    const search = query.search?.trim() || undefined;

    const { payments, total } = await this.paymentRepository.findMyPayments({
      userId: user.id,

      userRole: user.role,

      page,
      limit,

      status: query.status,

      paymentType: query.paymentType,

      search,
    });

    const items = await Promise.all(
      payments.map(async (payment) => {
        const razorpayPayment = await this.resolveRazorpayPayment(payment);

        return this.buildCombinedPaymentResponse(payment, razorpayPayment);
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

  async generateInvoicePdf(
    user: User,
    bookingId: number,
  ): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    const booking = await this.bookingRepository.findBookingById(bookingId);

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

    const payment = await this.paymentRepository.findLatestByBookingId(
      booking.id,
    );

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const razorpayPayment = await this.resolveRazorpayPayment(payment);

    const finalStatus = this.resolvePaymentStatus(payment, razorpayPayment);

    const isPaid = this.isSuccessfulPaymentStatus(finalStatus);

    const amount =
      razorpayPayment?.amount != null
        ? Number(razorpayPayment.amount) / 100
        : Number(payment.amount ?? 0);

    const invoiceTitle = isPaid
      ? 'Poojawala Tax Invoice'
      : 'Poojawala Proforma Invoice';

    const invoiceId = isPaid
      ? `INV-${booking.bookingNumber}`
      : `PROFORMA-${booking.bookingNumber}`;

    const html = paymentInvoiceTemplate({
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
        razorpayPayment?.id ?? payment.razorpayPaymentId ?? '-',
      ),

      orderId: String(
        razorpayPayment?.order_id ?? payment.razorpayOrderId ?? '-',
      ),

      paymentMethod: this.formatPaymentMethod(
        razorpayPayment?.method ?? payment.paymentMethod ?? '-',
      ),

      paymentStatus: this.getPaymentStatusDisplay(finalStatus),

      statusClass: this.getStatusClass(finalStatus),

      currency: String(razorpayPayment?.currency ?? payment.currency ?? 'INR'),

      amount: amount.toFixed(2),

      finalAmount: Number(booking.finalAmount).toFixed(2),

      donationAmount: Number(booking.donationAmount ?? 0).toFixed(2),

      discountAmount: Number(booking.discountAmount ?? 0).toFixed(2),

      date: new Date(payment.paidAt ?? payment.createdAt).toLocaleString(
        'en-IN',
        {
          timeZone: 'Asia/Kolkata',
        },
      ),

      errorMessage: String(
        razorpayPayment?.error_description ?? payment.failureReason ?? '-',
      ),
    });

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

        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      return {
        buffer: Buffer.from(pdfBuffer),

        filename: `invoice-${booking.bookingNumber}.pdf`,
      };
    } catch (error) {
      this.logger.error(
        `Invoice generation failed for booking ${booking.id}`,
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

    refundPayment.razorpayRefundId = refund.id;

    if (refund.payment_id) {
      refundPayment.razorpayPaymentId = refund.payment_id;
    }

    if (refundPayment.status !== PAYMENT_STATUS.SUCCESS) {
      refundPayment.status = PAYMENT_STATUS.PENDING;
    }

    refundPayment.failureReason = undefined;

    await this.paymentRepository.savePayment(refundPayment);

    this.logger.log(
      `Refund ${refund.id} created for refund payment ${refundPayment.id}`,
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

    /*
     * Fallback for cases where Razorpay does not return
     * notes in the processed webhook.
     */
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
     * Razorpay may send the same webhook repeatedly.
     */
    if (
      refundPayment.status === PAYMENT_STATUS.SUCCESS &&
      refundPayment.razorpayRefundId === refund.id
    ) {
      this.logger.log(
        `Duplicate refund.processed webhook ignored for refund payment ${refundPayment.id}`,
      );

      return;
    }

    refundPayment.razorpayRefundId = refund.id;

    if (refund.payment_id) {
      refundPayment.razorpayPaymentId = refund.payment_id;
    }

    refundPayment.status = PAYMENT_STATUS.SUCCESS;

    refundPayment.failureReason = undefined;

    refundPayment.paidAt = refund.created_at
      ? new Date(refund.created_at * 1000)
      : new Date();

    await this.paymentRepository.savePayment(refundPayment);

    this.logger.log(
      `Refund ${refund.id} processed successfully for refund payment ${refundPayment.id}`,
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

    /*
     * Never downgrade a successful refund.
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

    this.logger.error(
      `Refund ${refund.id} failed for refund payment ${refundPayment.id}: ${refundPayment.failureReason}`,
    );
  }

  private async fetchPaymentFromRazorpay(
    razorpayPaymentId: string,
  ): Promise<RazorpayPaymentData | null> {
    try {
      return (await this.razorpay.payments.fetch(
        razorpayPaymentId,
      )) as unknown as RazorpayPaymentData;
    } catch (error) {
      this.logger.warn(
        `Unable to fetch Razorpay payment ${razorpayPaymentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  private async fetchOrderPaymentsFromRazorpay(
    razorpayOrderId: string,
  ): Promise<RazorpayPaymentData[]> {
    try {
      const response = (await this.razorpay.orders.fetchPayments(
        razorpayOrderId,
      )) as unknown as RazorpayPaymentCollection;

      return response.items ?? [];
    } catch (error) {
      this.logger.warn(
        `Unable to fetch payments for Razorpay order ${razorpayOrderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
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

  private async resolveRazorpayPayment(
    payment: Payment,
  ): Promise<RazorpayPaymentData | null> {
    if (payment.razorpayPaymentId) {
      const directPayment = await this.fetchPaymentFromRazorpay(
        payment.razorpayPaymentId,
      );

      if (directPayment) {
        return directPayment;
      }
    }

    if (payment.razorpayOrderId) {
      const paymentAttempts = await this.fetchOrderPaymentsFromRazorpay(
        payment.razorpayOrderId,
      );

      return this.selectBestRazorpayPayment(paymentAttempts);
    }

    return null;
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

  private buildCombinedPaymentResponse(
    payment: Payment,
    razorpayPayment: RazorpayPaymentData | null,
  ): PaymentDetailsResponse {
    const amount =
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

    return {
      id: payment.id,

      paymentType: payment.paymentType,

      bookingId:
        payment.bookingId ?? payment.paymentBookings?.[0]?.bookingId ?? null,

      linkedBookings:
        payment.paymentBookings?.map((paymentBooking) => ({
          id: paymentBooking.bookingId,

          bookingNumber: paymentBooking.booking?.bookingNumber,
        })) ?? [],

      createdById: payment.createdById,

      payerId: payment.payerId ?? null,

      payeeId: payment.payeeId ?? null,

      amount,

      currency: razorpayPayment?.currency ?? payment.currency,

      status: this.mapRazorpayStatus(razorpayPayment?.status, payment.status),

      providerStatus: razorpayPayment?.status ?? null,

      paymentMethod:
        this.mapRazorpayMethod(
          razorpayPayment?.method,
          payment.paymentMethod,
        ) ?? null,

      razorpayOrderId:
        razorpayPayment?.order_id ?? payment.razorpayOrderId ?? null,

      razorpayPaymentId:
        razorpayPayment?.id ?? payment.razorpayPaymentId ?? null,

      razorpayRefundId: payment.razorpayRefundId ?? null,

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

            notes: razorpayPayment.notes ?? null,

            providerCreatedAt: razorpayPayment.created_at
              ? new Date(razorpayPayment.created_at * 1000)
              : null,
          }
        : null,

      razorpayRaw: razorpayPayment,

      source: razorpayPayment ? 'RAZORPAY_WITH_DB_FALLBACK' : 'DATABASE_ONLY',
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

      bookingId: query.bookingId,

      customerId: query.customerId,

      purohitId: query.purohitId,

      search,

      fromDate: query.fromDate,

      toDate: query.toDate,
    });

    const items = await Promise.all(
      payments.map(async (payment) => {
        const razorpayPayment = await this.resolveRazorpayPayment(payment);

        return this.buildCombinedPaymentResponse(payment, razorpayPayment);
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
    currency: string;
    providerStatus: string;
    status: PAYMENT_STATUS;
  }> {
    const originalPayment =
      await this.paymentRepository.findPaymentById(paymentId);

    if (!originalPayment) {
      throw new NotFoundException('Payment not found');
    }

    if (originalPayment.status !== PAYMENT_STATUS.SUCCESS) {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    if (!originalPayment.razorpayPaymentId) {
      throw new BadRequestException('Razorpay payment ID is missing');
    }

    const originalAmount = Number(originalPayment.amount);

    const refundAmount = Number(dto.amount);

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    if (refundAmount > originalAmount) {
      throw new BadRequestException(
        'Refund amount cannot exceed the original payment amount',
      );
    }

    const amountInPaise = Math.round(refundAmount * 100);

    /*
     * Create local refund record first so its ID
     * can be included in Razorpay notes.
     */
    const refundPayment = this.paymentRepository.create({
      paymentType: PAYMENT_TYPE.CUSTOMER_REFUND,

      bookingId: originalPayment.bookingId,

      createdById: admin.id,

      payerId: originalPayment.payeeId,

      payeeId: originalPayment.payerId,

      amount: refundAmount,

      currency: originalPayment.currency ?? 'INR',

      paymentMethod: originalPayment.paymentMethod,

      status: PAYMENT_STATUS.PENDING,
    });

    const savedRefundPayment = await this.dataSource.transaction(
      async (manager) => {
        const paymentRepository = manager.getRepository(Payment);

        const paymentBookingRepository = manager.getRepository(PaymentBooking);

        const refundPayment = paymentRepository.create({
          paymentType: PAYMENT_TYPE.CUSTOMER_REFUND,

          bookingId: originalPayment.bookingId,

          createdById: admin.id,

          payerId: originalPayment.payeeId,

          payeeId: originalPayment.payerId,

          amount: refundAmount,

          currency: originalPayment.currency ?? 'INR',

          paymentMethod: originalPayment.paymentMethod,

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

            reason: dto.reason?.trim() ?? 'Admin initiated refund',
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

      savedRefundPayment.status =
        razorpayRefund.status === 'processed'
          ? PAYMENT_STATUS.SUCCESS
          : PAYMENT_STATUS.PENDING;

      savedRefundPayment.paidAt =
        razorpayRefund.status === 'processed' ? new Date() : undefined;

      await this.paymentRepository.savePayment(savedRefundPayment);

      return {
        refundPaymentId: savedRefundPayment.id,

        originalPaymentId: originalPayment.id,

        razorpayRefundId: razorpayRefund.id,

        razorpayPaymentId: originalPayment.razorpayPaymentId,

        amount: refundAmount,

        currency: razorpayRefund.currency ?? originalPayment.currency ?? 'INR',

        providerStatus: razorpayRefund.status ?? 'pending',

        status: savedRefundPayment.status,
      };
    } catch (error) {
      savedRefundPayment.status = PAYMENT_STATUS.FAILED;

      savedRefundPayment.failureReason =
        error instanceof Error ? error.message : 'Refund creation failed';

      await this.paymentRepository.savePayment(savedRefundPayment);

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      const razorpayError = error as RazorpayError;

      throw new BadRequestException(
        razorpayError.error?.description ??
          razorpayError.message ??
          'Unable to create refund',
      );
    }
  }
}
