import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioClient: Twilio;

  constructor(private readonly configService: ConfigService) {
    this.twilioClient = new Twilio(
      this.configService.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.configService.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
  }

  async sendOtpSms(to: string, otp: string) {
    const phoneNumber = to.startsWith('+') ? to : `+91${to}`;

    try {
      const response = await this.twilioClient.messages.create({
        body: `Your HiChandra OTP is ${otp}. This OTP expires in 10 minutes.`,
        from: this.configService.getOrThrow<string>('TWILIO_PHONE_NUMBER'),
        to: phoneNumber,
      });

      this.logger.log(
        `OTP SMS sent successfully to ${phoneNumber}. SID: ${response.sid}`,
      );

      return response;
    } catch (error: any) {
      this.logger.error(
        `Failed to send OTP SMS to ${phoneNumber}`,
        error?.stack,
      );

      throw error;
    }
  }

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
    } catch (error: any) {
      this.logger.error(
        `Failed to send SMS to ${phoneNumber}`,
        error?.stack,
      );

      throw error;
    }
  }
}
