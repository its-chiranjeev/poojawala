import { BadRequestException, Injectable, StreamableFile, NotFoundException, ForbiddenException } from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import puppeteer from 'puppeteer';
import { paymentInvoiceTemplate } from './templates/invoice.template';
import { User } from '@hichandra/entities';
import { BookingRepository, PaymentRepository } from '@hichandra/repositories';


interface CustomerData {
  name: string;
  email?: string;
  contact?: string;
}

interface NotifyData {
  email?: boolean;
  sms?: boolean;
}

interface PaymentLinkPayload {
  amount: number;
  currency: string;
  description: string;
  customer: CustomerData;
  reminder_enable: boolean;
  reference_id: string;
  notify?: NotifyData;
  callback_url?: string;
  callback_method?: string;
}

@Injectable()
export class PaymentService {
  private razorpay: Razorpay;

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly paymentRepository: PaymentRepository,
  ) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    // console.log('KEY ID:', process.env.RAZORPAY_KEY_ID);
    // console.log('KEY SECRET:', process.env.RAZORPAY_KEY_SECRET);
  }

  async createPaymentLink(
    amount: number,
    bookingId: number,
    customer: { name: string; email?: string; phone?: string },
    description?: string,
    customCallbackUrl?: string,
  ) {
    const customerData: CustomerData = {
      name: customer.name,
    };
    const notifyData: NotifyData = {};

    if (customer.email && customer.email.trim() !== '') {
      customerData.email = customer.email;
      notifyData.email = true;
    }
    if (customer.phone && customer.phone.trim() !== '') {
      customerData.contact = customer.phone;
      notifyData.sms = true;
    }

    // Append unique timestamp so the customer can retry payment without duplicate reference_id error
    const referenceId = `booking_${bookingId}_${Date.now()}`;

    const payload: PaymentLinkPayload = {
      amount: amount * 100,
      currency: 'INR',
      //description: `Payment for Booking #${bookingId}`,
      description: description || `Payment for Booking #${bookingId}`,
      customer: customerData,
      reminder_enable: true,
      reference_id: referenceId,
    };

    const callbackUrl = customCallbackUrl || process.env.FRONTEND_PAYMENT_CALLBACK_URL;
    if (callbackUrl && callbackUrl.trim() !== '') {
      payload.callback_url = callbackUrl;
      payload.callback_method = 'get';
    }

    if (Object.keys(notifyData).length > 0) {
      payload.notify = notifyData;
    }

    try {
      console.log('Creating payment link...');
      const paymentLink = await this.razorpay.paymentLink.create(
        payload as unknown as Parameters<Razorpay['paymentLink']['create']>[0],
      );

      console.log(paymentLink);
      return {
        paymentLinkId: paymentLink.id,
        url: paymentLink.short_url,
        amount: amount,
      };
    } catch (err: unknown) {
      const error = err as {
        error?: { description?: string };
        message?: string;
      };
      throw new BadRequestException(
        error.error?.description ||
        error.message ||
        'Razorpay payment link creation failed',
      );
    }
  }

  async createTokenPaymentLink(
    amount: number,
    userId: number,
    customer: { name: string; email?: string; phone?: string },
    customCallbackUrl?: string,
  ) {
    const customerData: CustomerData = {
      name: customer.name,
    };
    const notifyData: NotifyData = {};

    if (customer.email && customer.email.trim() !== '') {
      customerData.email = customer.email;
      notifyData.email = true;
    }
    if (customer.phone && customer.phone.trim() !== '') {
      customerData.contact = customer.phone;
      notifyData.sms = true;
    }

    const referenceId = `token_user_${userId}_${Date.now()}`;

    const payload: PaymentLinkPayload = {
      amount: amount * 100,
      currency: 'INR',
      description: `Token Pre-Payment before booking`,
      customer: customerData,
      reminder_enable: true,
      reference_id: referenceId,
    };

    const callbackUrl = customCallbackUrl || process.env.FRONTEND_PAYMENT_CALLBACK_URL;
    if (callbackUrl && callbackUrl.trim() !== '') {
      payload.callback_url = callbackUrl;
      payload.callback_method = 'get';
    }

    if (Object.keys(notifyData).length > 0) {
      payload.notify = notifyData;
    }

    try {
      console.log('Creating token payment link...');
      const paymentLink = await this.razorpay.paymentLink.create(
        payload as unknown as Parameters<Razorpay['paymentLink']['create']>[0],
      );

      console.log(paymentLink);
      return {
        paymentLinkId: paymentLink.id,
        url: paymentLink.short_url,
        amount: amount,
      };
    } catch (err: unknown) {
      const error = err as {
        error?: { description?: string };
        message?: string;
      };
      throw new BadRequestException(
        error.error?.description || error.message || 'Failed to create token payment link',
      );
    }
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(rawBody)
      .digest('hex');
    return expectedSignature === signature;
  }

  private getPaymentStatusDisplay(status: string): string {
    switch (status?.toLowerCase()) {
      case 'captured':
      case 'paid':
      case 'success':
        return 'Paid';

      case 'failed':
        return 'Failed';

      case 'authorized':
        return 'Authorized';

      case 'created':
      case 'pending':
        return 'Pending';

      case 'refunded':
        return 'Refunded';

      default:
        return status || 'Pending';
    }
  }

  private formatPaymentMethod(method: string): string {
    const paymentMethods: Record<string, string> = {
      netbanking: 'Net Banking',
      card: 'Card',
      upi: 'UPI',
      wallet: 'Wallet',
      emi: 'EMI',
    };

    return paymentMethods[method?.toLowerCase()] || method || '-';
  }

  async generateInvoicePdf(
    user: User,
    bookingId: number,
  ): Promise<StreamableFile> {
    const booking =
      await this.bookingRepository.findBookingById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.customerId !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to download this invoice',
      );
    }

    const payment =
      await this.paymentRepository.findLatestByBookingId(booking.id);

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    let razorpayPayment: Record<string, unknown> | null = null;

    if (payment?.paymentId) {
      try {
        razorpayPayment =
          (await this.razorpay.payments.fetch(payment.paymentId)) as unknown as Record<
            string,
            unknown
          >;
      } catch {
        razorpayPayment = null;
      }
    }

    let finalStatus: string;

    // 1. Prefer Razorpay
    if (razorpayPayment?.status) {
      finalStatus = String(razorpayPayment.status).toLowerCase();
    } else {
      // 2. Fallback to DB
      finalStatus = String(payment.status ?? 'PENDING').toLowerCase();
    }

    const paymentStatusDisplay =
      this.getPaymentStatusDisplay(finalStatus);

    const isPaid =
      finalStatus === 'captured' ||
      finalStatus === 'paid' ||
      finalStatus === 'success';

    const statusClass = isPaid
      ? 'success'
      : finalStatus === 'failed'
        ? 'failed'
        : 'pending';

    const paymentMethodDisplay =
      this.formatPaymentMethod(
        String(razorpayPayment?.method ?? '-'),
      );

    const amount =
      razorpayPayment?.amount
        ? Number(razorpayPayment.amount) / 100
        : Number(payment.amount ?? 0);

    const errorMessage = String(
      razorpayPayment?.error_description ??
      payment.errorMessage ??
      '-',
    );

    const invoiceTitle = isPaid
      ? 'HiChandra Tax Invoice'
      : 'HiChandra Proforma Invoice';

    const invoiceId = isPaid
      ? `INV-${booking.id}`
      : `PROFORMA-INV-${booking.id}`;

    const dateLabel = isPaid
      ? 'Payment Date'
      : 'Invoice Date';

    const serviceBasePrice =
      Number(booking.service?.pricingRule?.serviceBasePrice ?? 0);

    const gst =
      Number(booking.service?.pricingRule?.gst ?? 0);

    const platformFee =
      Number(booking.service?.pricingRule?.platformFee ?? 0);

    const gstAmount = (serviceBasePrice * gst) / 100;

    const finalAmount =
      serviceBasePrice + gstAmount + platformFee;

    const html = paymentInvoiceTemplate({

      companyName: process.env.HICHANDRA_COMPANY_NAME ?? 'HiChandra',
      companyEmail: process.env.HICHANDRA_COMPANY_EMAIL ?? '-',
      companyPhone: process.env.HICHANDRA_COMPANY_PHONE ?? '-',
      companyAddress: process.env.HICHANDRA_COMPANY_ADDRESS ?? '-',
      companyGstin:process.env.HICHANDRA_GSTIN ?? '-',

      billingAddress: booking.address
        ? [
          booking.address.fullAddress,
          booking.address.city,
          booking.address.state,
          booking.address.pincode,
        ]
          .filter(Boolean)
          .join(', ')
        : '-',

      technicianName: booking.technician
        ? `${booking.technician.firstName} ${booking.technician.lastName}`
        : '-',

      serviceBasePrice: serviceBasePrice.toFixed(2),
      gstPercent: gst.toFixed(2),
      gstAmount: gstAmount.toFixed(2),
      platformFee: platformFee.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
      invoiceTitle,
      invoiceId,
      dateLabel,

      bookingId: booking.id,

      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      customerEmail: booking.customer.email ?? '-',
      customerPhone: booking.customer.phone ?? '-',

      serviceName: booking.service?.name,
      bookingStatus: booking.status.toLowerCase(),

      paymentId: String(
        razorpayPayment?.id ?? payment.paymentId ?? '-',
      ),

      orderId: String(
        razorpayPayment?.order_id ?? payment.orderId ?? '-',
      ),

      paymentMethod: paymentMethodDisplay,

      paymentStatus: paymentStatusDisplay,

      statusClass,

      currency: String(
        razorpayPayment?.currency ?? payment.currency ?? 'INR',
      ),

      amount: amount.toFixed(2),

      date: new Date(payment.createdAt).toLocaleString('en-IN'),

      errorMessage,
    });

    const browser = await puppeteer.launch({
      headless: true,
    });

    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: 'load',
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      return new StreamableFile(pdfBuffer, {
        type: 'application/pdf',
        disposition: `attachment; filename=invoice-${booking.id}.pdf`,
      });
    } finally {
      await browser.close();
    }
  }
}