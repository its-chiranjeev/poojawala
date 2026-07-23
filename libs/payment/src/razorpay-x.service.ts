import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class RazorpayXService {
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  private get auth() {
    return {
      username: process.env.RAZORPAY_KEY_ID || '',
      password: process.env.RAZORPAY_KEY_SECRET || '',
    };
  }

  async createContact(params: {
    technicianId: number;
    name: string;
    email?: string;
    phone?: string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/contacts`,
        {
          name: params.name,
          type: 'vendor',
          email: params.email,
          contact: params.phone,
          reference_id: `TECHNICIAN_${params.technicianId}`,
          notes: {
            technicianId: String(params.technicianId),
            platform: 'HiChandra',
          },
        },
        {
          auth: this.auth,
        },
      );

      return response.data;
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            error?: {
              description?: string;
            };
          };
        };
        message?: string;
      };

      throw new BadRequestException(
        error.response?.data?.error?.description ||
          error.message ||
          'Failed to create RazorpayX contact',
      );
    }
  }

  async createFundAccount(params: {
    contactId: string;
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/fund_accounts`,
        {
          contact_id: params.contactId,
          account_type: 'bank_account',
          bank_account: {
            name: params.accountHolderName,
            account_number: params.accountNumber,
            ifsc: params.ifscCode,
          },
        },
        {
          auth: this.auth,
        },
      );

      return response.data;
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            error?: {
              description?: string;
            };
          };
        };
        message?: string;
      };

      throw new BadRequestException(
        error.response?.data?.error?.description ||
          error.message ||
          'Failed to create RazorpayX fund account',
      );
    }
  }

  async createVpaFundAccount(params: {
    contactId: string;
    upiId: string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/fund_accounts`,
        {
          contact_id: params.contactId,
          account_type: 'vpa',
          vpa: {
            address: params.upiId,
          },
        },
        {
          auth: this.auth,
        },
      );

      return response.data;
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            error?: {
              description?: string;
            };
          };
        };
        message?: string;
      };

      throw new BadRequestException(
        error.response?.data?.error?.description ||
          error.message ||
          'Failed to create RazorpayX UPI fund account',
      );
    }
  }

  async createPayout(params: {
    fundAccountId: string;
    amount: number;
    bookingId: number;
    technicianId: number;
    internalPayoutId: number;
    idempotencyKey: string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/payouts`,
        {
          account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER || '',
          fund_account_id: params.fundAccountId,
          amount: Math.round(params.amount * 100),
          currency: 'INR',
          mode: 'IMPS',
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: `HC_BOOKING_${params.bookingId}_PAYOUT_${params.internalPayoutId}`,
          narration: 'HiChandra Technician Payout',
          notes: {
            bookingId: String(params.bookingId),
            technicianId: String(params.technicianId),
            internalPayoutId: String(params.internalPayoutId),
          },
        },
        {
          auth: this.auth,
          headers: {
            'X-Payout-Idempotency': params.idempotencyKey,
          },
        },
      );

      return response.data;
    } catch (err: unknown) {
      const error = err as {
        response?: {
          data?: {
            error?: {
              description?: string;
            };
          };
        };
        message?: string;
      };

      throw new InternalServerErrorException(
        error.response?.data?.error?.description ||
          error.message ||
          'Failed to create RazorpayX payout',
      );
    }
  }
}