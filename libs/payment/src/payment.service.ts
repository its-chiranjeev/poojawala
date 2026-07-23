import { BadRequestException, Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

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
}

@Injectable()
export class PaymentService {
  private razorpay: Razorpay;

  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    console.log('KEY ID:', process.env.RAZORPAY_KEY_ID);
console.log('KEY SECRET:', process.env.RAZORPAY_KEY_SECRET);
  }

  async createPaymentLink(
    amount: number,
    bookingId: number,
    customer: { name: string; email?: string; phone?: string },
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
      description: `Payment for Booking #${bookingId}`,
      customer: customerData,
      reminder_enable: true,
      reference_id: referenceId,
    };

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

  verifyWebhook(rawBody: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(rawBody)
      .digest('hex');
    return expectedSignature === signature;
  }
}
