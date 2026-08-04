import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, StreamableFile,} from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';
import { Booking, BOOKING_PAYMENT_STATUS, BOOKING_STATUS, Payment, PAYMENT_METHOD, PAYMENT_STATUS, PAYMENT_TYPE, User, USER_ROLE,} from '@likemyproduct/entities';
import { BookingRepository, PaymentRepository,} from '@likemyproduct/repositories';
import { CreatePaymentLinkDto } from '@likemyproduct/dtos';
import { paymentInvoiceTemplate } from './templates/invoice.template';

interface RazorpayError {
  error?: {
    description?: string;
  };
  message?: string;
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
  notes?: Record<string, unknown> | string[];
  created_at?: number;
}

interface RazorpayPaymentCollection {
  entity?: string;
  count?: number;
  items?: RazorpayPaymentData[];
}

interface RazorpayOrderData {
  id: string;
  entity?: string;
  amount: number;
  amount_paid?: number;
  amount_due?: number;
  currency: string;
  receipt?: string;
  status?: string;
  attempts?: number;
  notes?: Record<string, string>;
  created_at?: number;
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
  notes: Record<string, unknown> | string[] | null;
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

export interface BookingPaymentOrderResponse {
  paymentId: number;
  razorpayKeyId: string;
  razorpayOrderId: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  bookingId: number;
  bookingNumber: string;

  customer: {
    name: string;
    email?: string;
    contact?: string;
  };

  status: PAYMENT_STATUS;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  private readonly razorpay: Razorpay;

  private readonly razorpayKeyId: string;

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly paymentRepository: PaymentRepository,
  ) {
    const keyId = process.env['RAZORPAY_KEY_ID'];

    const keySecret = process.env['RAZORPAY_KEY_SECRET'];

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials are not configured');
    }

    this.razorpayKeyId = keyId;

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createBookingPaymentLink(
    user: User,
    dto: CreatePaymentLinkDto,
  ): Promise<BookingPaymentOrderResponse> {
    const booking = await this.bookingRepository.findBookingById(dto.bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    this.validatePaymentCreationAccess(user, booking);

    const existingPendingPayment = await this.paymentRepository.findOne({
      where: {
        bookingId: booking.id,
        payerId: user.id,
        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
        status: PAYMENT_STATUS.PENDING,
      },

      order: {
        createdAt: 'DESC',
      },
    });

    if (existingPendingPayment?.razorpayOrderId) {
      return {
        paymentId: existingPendingPayment.id,

        razorpayKeyId: this.razorpayKeyId,

        razorpayOrderId: existingPendingPayment.razorpayOrderId,

        amount: Number(existingPendingPayment.amount),

        amountInPaise: Math.round(Number(existingPendingPayment.amount) * 100),

        currency: existingPendingPayment.currency,

        bookingId: booking.id,

        bookingNumber: booking.bookingNumber,

        customer: this.getPaymentCustomer(user, booking),

        status: existingPendingPayment.status,
      };
    }

    const amount = this.getBookingAmount(booking);

    const razorpayOrder = await this.createRazorpayOrder(
      amount,
      booking,
      dto.description,
    );

    const payment = this.paymentRepository.create({
      paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,

      bookingId: booking.id,

      createdById: user.id,

      payerId: user.id,

      payeeId: booking.purohit?.userId,

      amount,

      currency: razorpayOrder.currency ?? 'INR',

      razorpayOrderId: razorpayOrder.id,

      status: PAYMENT_STATUS.PENDING,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    return {
      paymentId: savedPayment.id,

      razorpayKeyId: this.razorpayKeyId,

      razorpayOrderId: razorpayOrder.id,

      amount,

      amountInPaise: razorpayOrder.amount,

      currency: razorpayOrder.currency,

      bookingId: booking.id,

      bookingNumber: booking.bookingNumber,

      customer: this.getPaymentCustomer(user, booking),

      status: savedPayment.status,
    };
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
  ): {
    name: string;
    email?: string;
    contact?: string;
  } {
    const name = [booking.customer?.firstName, booking.customer?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const email = booking.customer?.email ?? user.email ?? undefined;

    const contact = booking.customer?.phone ?? user.phone ?? undefined;

    return {
      name: name || user.username || 'Customer',

      ...(email ? { email } : {}),

      ...(contact ? { contact } : {}),
    };
  }

  private async createRazorpayOrder(
    amount: number,
    booking: Booking,
    description?: string,
  ): Promise<RazorpayOrderData> {
    const amountInPaise = Math.round(amount * 100);

    const receipt = `booking_${booking.id}_${Date.now()}`.slice(0, 40);

    try {
      const order = await this.razorpay.orders.create({
        amount: amountInPaise,

        currency: 'INR',

        receipt,

        notes: {
          bookingId: String(booking.id),

          bookingNumber: booking.bookingNumber,

          description:
            description?.trim() ||
            `Payment for booking ${booking.bookingNumber}`,
        },
      });

      if (!order.id) {
        throw new InternalServerErrorException(
          'Invalid order response received from Razorpay',
        );
      }

      return order as unknown as RazorpayOrderData;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      const razorpayError = error as RazorpayError;

      this.logger.error(
        `Razorpay order creation failed for booking ${booking.id}`,
        razorpayError.error?.description || razorpayError.message,
      );

      throw new BadRequestException(
        razorpayError.error?.description ||
          razorpayError.message ||
          'Razorpay order creation failed',
      );
    }
  }

  verifyCheckoutSignature(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): boolean {
    const keySecret = process.env['RAZORPAY_KEY_SECRET'];

    if (!keySecret) {
      throw new InternalServerErrorException(
        'Razorpay key secret is not configured',
      );
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new BadRequestException(
        'Razorpay order ID, payment ID and signature are required',
      );
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    const receivedBuffer = Buffer.from(razorpaySignature, 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  async confirmBookingPayment(
    user: User,
    paymentId: number,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<PaymentDetailsResponse> {
    const payment = await this.paymentRepository.findOne({
      where: {
        id: paymentId,
      },

      relations: {
        booking: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (
      user.role !== USER_ROLE.ADMIN &&
      payment.payerId !== user.id &&
      payment.createdById !== user.id
    ) {
      throw new ForbiddenException('You cannot confirm this payment');
    }

    if (payment.razorpayOrderId !== razorpayOrderId) {
      throw new BadRequestException(
        'Razorpay order ID does not match the payment record',
      );
    }

    const isValidSignature = this.verifyCheckoutSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );

    if (!isValidSignature) {
      throw new BadRequestException('Invalid Razorpay payment signature');
    }

    const razorpayPayment =
      await this.fetchPaymentFromRazorpay(razorpayPaymentId);

    if (!razorpayPayment) {
      throw new BadRequestException('Unable to verify payment with Razorpay');
    }

    if (razorpayPayment.order_id !== razorpayOrderId) {
      throw new BadRequestException(
        'Razorpay payment does not belong to this order',
      );
    }

    payment.razorpayPaymentId = razorpayPaymentId;

    payment.status = this.mapRazorpayStatus(
      razorpayPayment.status,
      payment.status,
    );

    payment.paymentMethod = this.mapRazorpayMethod(
      razorpayPayment.method,
      payment.paymentMethod,
    );

    payment.failureReason = razorpayPayment.error_description ?? undefined;

    if (this.isSuccessfulPaymentStatus(razorpayPayment.status ?? '')) {
      payment.paidAt = razorpayPayment.created_at
        ? new Date(razorpayPayment.created_at * 1000)
        : new Date();
    }

    const savedPayment = await this.paymentRepository.save(payment);

    return this.buildCombinedPaymentResponse(savedPayment, razorpayPayment);
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

  async getPaymentDetails(
    user: User,
    paymentId: number,
  ): Promise<PaymentDetailsResponse> {
    const payment = await this.paymentRepository.findOne({
      where: {
        id: paymentId,
      },

      relations: {
        booking: {
          customer: true,
          service: true,
          purohit: {
            user: true,
          },
        },

        paymentBookings: {
          booking: true,
        },
      },
    });

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

  async generateInvoicePdf(
    user: User,
    bookingId: number,
  ): Promise<StreamableFile> {
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

    const payment = await this.paymentRepository.findOne({
      where: {
        bookingId: booking.id,
        paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
      },

      order: {
        createdAt: 'DESC',
      },
    });

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
      });

      return new StreamableFile(Buffer.from(pdfBuffer), {
        type: 'application/pdf',

        disposition: `attachment; filename="invoice-${booking.bookingNumber}.pdf"`,
      });
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

      case 'created':
      case 'pending':
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
    const normalizedMethod = method.toLowerCase();

    const methods: Record<string, string> = {
      netbanking: 'Net Banking',

      card: 'Card',

      upi: 'UPI',

      wallet: 'Wallet',

      emi: 'EMI',

      bank_transfer: 'Bank Transfer',
    };

    return methods[normalizedMethod] || method || '-';
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

      razorpayRaw: this.getSafeRazorpayRaw(razorpayPayment),

      source: razorpayPayment ? 'RAZORPAY_WITH_DB_FALLBACK' : 'DATABASE_ONLY',
    };
  }

  private getSafeRazorpayRaw(
    payment: RazorpayPaymentData | null,
  ): RazorpayPaymentData | null {
    return payment;
  }
}
