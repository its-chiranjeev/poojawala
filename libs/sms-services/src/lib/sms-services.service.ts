import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Twilio } from 'twilio';

// ─── Fast2SMS Smart OTP response shapes ──────────────────────────────────────

interface Fast2SmsOtpSendResponse {
  return: boolean;
  request_id: string;
  message: string[];
}

interface Fast2SmsOtpVerifyResponse {
  return: boolean;
  message: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  // TODO: FAST2SMS_MIGRATION
  // Twilio client retained for rollback/reference and for non-OTP SMS delivery (sendSms).
  // The OTP send path (sendOtpSms) has been replaced by Fast2SMS Smart OTP.
  // Re-enable Twilio OTP only if Fast2SMS integration is rolled back.
  private readonly twilioClient: Twilio;

  /** Fast2SMS API key — sourced from env, never logged. */
  private readonly fast2smsApiKey: string;

  /** Fast2SMS Smart OTP template ID */
  private readonly fast2smsOtpId: string;

  /** OTP expiry in minutes (passed to Fast2SMS) */
  private readonly fast2smsOtpExpiryMinutes: number;

  /** OTP digit length (passed to Fast2SMS) */
  private readonly fast2smsOtpLength: number;

  /** Timeout for Fast2SMS HTTP requests in milliseconds */
  private static readonly FAST2SMS_TIMEOUT_MS = 10_000;

  constructor(private readonly configService: ConfigService) {
    this.twilioClient = new Twilio(
      this.configService.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.configService.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );

    // Fast2SMS credentials — validated at startup to avoid silent misconfiguration.
    this.fast2smsApiKey = this.configService.getOrThrow<string>('FAST2SMS_API_KEY');
    this.fast2smsOtpId = this.configService.getOrThrow<string>('FAST2SMS_OTP_ID');

    const expiryRaw = this.configService.get<string>('FAST2SMS_OTP_EXPIRY_MINUTES');
    this.fast2smsOtpExpiryMinutes = expiryRaw ? parseInt(expiryRaw, 10) : 10;

    const lengthRaw = this.configService.get<string>('FAST2SMS_OTP_LENGTH');
    this.fast2smsOtpLength = lengthRaw ? parseInt(lengthRaw, 10) : 6;
  }

  // ─── Fast2SMS Smart OTP ───────────────────────────────────────────────────

  /**
   * Sends an OTP via Fast2SMS Smart OTP API.
   *
   * Fast2SMS internally attempts delivery via:
   *   1. WhatsApp (primary)
   *   2. SMS (automatic fallback if WhatsApp fails)
   *
   * Poojawala does NOT implement the WhatsApp→SMS fallback manually;
   * it is fully handled by Fast2SMS Smart OTP configuration.
   *
   * @param mobile  Indian mobile number (10 digits, without country code).
   */
  async sendOtpViaFast2sms(mobile: string): Promise<void> {
    // Strip any leading +91 or 0 to get the bare 10-digit number.
    const normalizedMobile = this.normalizeMobileForFast2sms(mobile);

    this.logger.log(
      `[Fast2SMS] OTP send request initiated for mobile ending …${normalizedMobile.slice(-4)}`,
    );

    try {
      const response = await axios.post<Fast2SmsOtpSendResponse>(
        'https://www.fast2sms.com/dev/otp/send',
        {
          mobile: normalizedMobile,
          otp_id: this.fast2smsOtpId,
          otp_expiry: this.fast2smsOtpExpiryMinutes,
          otp_length: this.fast2smsOtpLength,
        },
        {
          headers: {
            // Authorization header carries the API key — never expose in logs.
            authorization: this.fast2smsApiKey,
            'Content-Type': 'application/json',
          },
          timeout: SmsService.FAST2SMS_TIMEOUT_MS,
        },
      );

      if (!response.data?.return) {
        this.logger.error(
          `[Fast2SMS] OTP send rejected for mobile ending …${normalizedMobile.slice(-4)}: ` +
          `${JSON.stringify(response.data?.message)}`,
        );
        throw new InternalServerErrorException(
          'OTP delivery service rejected the request',
        );
      }

      this.logger.log(
        `[Fast2SMS] OTP send succeeded for mobile ending …${normalizedMobile.slice(-4)}. ` +
        `RequestId: ${response.data.request_id}`,
      );
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      if (axios.isAxiosError(error) && error.response) {
        // Provider returned an HTTP error — log safely without exposing the API key.
        this.logger.error(
          `[Fast2SMS] OTP send failed for mobile ending …${normalizedMobile.slice(-4)}. ` +
          `HTTP ${error.response.status}: ${JSON.stringify(error.response.data?.message ?? error.response.data)}`,
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[Fast2SMS] OTP send request failed for mobile ending …${normalizedMobile.slice(-4)}: ${message}`,
        );
      }
      throw new InternalServerErrorException(
        'Failed to send OTP. Please try again.',
      );
    }
  }

  /**
   * Verifies an OTP via Fast2SMS Smart OTP verify API.
   *
   * Returns `true` if Fast2SMS confirms the OTP is valid; `false` otherwise.
   * The caller is responsible for converting a `false` result into the
   * appropriate application error.
   *
   * @param mobile  Indian mobile number (10 digits, without country code).
   * @param otp     OTP string submitted by the user.
   */
  async verifyOtpViaFast2sms(mobile: string, otp: string): Promise<boolean> {
    const normalizedMobile = this.normalizeMobileForFast2sms(mobile);

    this.logger.log(
      `[Fast2SMS] OTP verify request initiated for mobile ending …${normalizedMobile.slice(-4)}`,
    );

    try {
      const response = await axios.post<Fast2SmsOtpVerifyResponse>(
        'https://www.fast2sms.com/dev/otp/verify',
        {
          mobile: normalizedMobile,
          otp,
        },
        {
          headers: {
            authorization: this.fast2smsApiKey,
            'Content-Type': 'application/json',
          },
          timeout: SmsService.FAST2SMS_TIMEOUT_MS,
        },
      );

      const verified = Boolean(response.data?.return);

      if (verified) {
        this.logger.log(
          `[Fast2SMS] OTP verification succeeded for mobile ending …${normalizedMobile.slice(-4)}`,
        );
      } else {
        this.logger.warn(
          `[Fast2SMS] OTP verification failed for mobile ending …${normalizedMobile.slice(-4)}: ` +
          `${JSON.stringify(response.data?.message)}`,
        );
      }

      return verified;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        // A 4xx typically means wrong OTP or expired — return false, not a 500.
        this.logger.error(
          `[Fast2SMS] OTP verify HTTP ${error.response.status} for mobile ending …${normalizedMobile.slice(-4)}: ` +
          `${JSON.stringify(error.response.data?.message ?? error.response.data)}`,
        );
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Fast2SMS] OTP verify request failed for mobile ending …${normalizedMobile.slice(-4)}: ${message}`,
      );
      throw new InternalServerErrorException(
        'OTP verification service unavailable. Please try again.',
      );
    }
  }

  // ─── Twilio OTP (legacy — retained for rollback) ─────────────────────────

  // TODO: FAST2SMS_MIGRATION
  // sendOtpSms was the previous OTP delivery mechanism using Twilio SMS.
  // It is now DISABLED. The active OTP send path uses sendOtpViaFast2sms().
  // Re-enable this method and update the callers in user.service.ts
  // if the Fast2SMS integration needs to be rolled back.
  //
  // async sendOtpSms(to: string, otp: string) {
  //   const phoneNumber = to.startsWith('+') ? to : `+91${to}`;
  //   try {
  //     const response = await this.twilioClient.messages.create({
  //       body: `Your poojawala OTP is ${otp}. This OTP expires in 10 minutes.`,
  //       from: this.configService.getOrThrow<string>('TWILIO_PHONE_NUMBER'),
  //       to: phoneNumber,
  //     });
  //     this.logger.log(`OTP SMS sent successfully to ${phoneNumber}. SID: ${response.sid}`);
  //     return response;
  //   } catch (error: any) {
  //     this.logger.error(`Failed to send OTP SMS to ${phoneNumber}`, error?.stack);
  //     throw error;
  //   }
  // }

  // ─── Twilio General SMS (active — used for non-OTP delivery) ─────────────

  async sendSms(to: string, message: string) {
    const phoneNumber = to.startsWith('+') ? to : `+91${to}`;

    try {
      const response = await this.twilioClient.messages.create({
        body: message,
        from: this.configService.getOrThrow<string>('TWILIO_PHONE_NUMBER'),
        to: phoneNumber,
      });

      this.logger.log(
        `SMS sent successfully to ${phoneNumber}. SID: ${response.sid}`,
      );

      return response;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send SMS to ${phoneNumber}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Normalizes an Indian mobile number to the bare 10-digit format
   * that Fast2SMS expects (no leading +91, 91, or 0).
   * Prevents accidentally sending "+91+91XXXXXXXXXX" or similar.
   */
  private normalizeMobileForFast2sms(mobile: string): string {
    let normalized = mobile.trim();
    // Remove leading +
    if (normalized.startsWith('+')) {
      normalized = normalized.slice(1);
    }
    // Remove country code 91 prefix when present (12 digits: 91 + 10)
    if (normalized.startsWith('91') && normalized.length === 12) {
      normalized = normalized.slice(2);
    }
    // Remove leading 0 (STD prefix, 11 digits)
    if (normalized.startsWith('0') && normalized.length === 11) {
      normalized = normalized.slice(1);
    }
    return normalized;
  }
}
