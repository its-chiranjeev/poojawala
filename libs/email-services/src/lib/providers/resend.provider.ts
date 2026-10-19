import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { getPlatformMailFrom } from '../config/platform.config';

export interface ResendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

@Injectable()
export class ResendProvider {
  private readonly logger = new Logger(ResendProvider.name);
  private readonly resend: Resend;

  constructor() {
    const apiKey = process.env['RESEND_API_KEY'];
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not defined in environment variables. Email sending may fail.');
    }
    this.resend = new Resend(apiKey);
  }

  public async sendMail(
    toOrOptions: string | string[] | ResendEmailOptions,
    subject?: string,
    html?: string,
  ) {
    let to: string | string[];
    let emailSubject: string;
    let emailHtml: string;
    let explicitFrom: string | undefined;

    if (typeof toOrOptions === 'object' && !Array.isArray(toOrOptions)) {
      to = toOrOptions.to;
      emailSubject = toOrOptions.subject;
      emailHtml = toOrOptions.html;
      explicitFrom = toOrOptions.from;
    } else {
      to = toOrOptions;
      emailSubject = subject!;
      emailHtml = html!;
    }

    const from = explicitFrom?.trim() || getPlatformMailFrom();
    const recipientStr = Array.isArray(to) ? to.join(', ') : to;

    try {
      const response = await this.resend.emails.send({
        from,
        to,
        subject: emailSubject,
        html: emailHtml,
      });

      if (!response || response.error) {
        const errorMessage =
          response?.error?.message || 'Empty or invalid response from Resend API';
        const errorName = response?.error?.name || 'ResendError';
        this.logger.error(
          `Resend API error sending email from "${from}" to "${recipientStr}" with subject "${emailSubject}": [${errorName}] ${errorMessage}`,
        );
        throw new Error(errorMessage);
      }

      this.logger.log(
        `Email sent successfully from "${from}" to "${recipientStr}". Email ID: ${response.data?.id}`,
      );

      return response;
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      this.logger.error(
        `Failed to deliver email from "${from}" to "${recipientStr}": ${errMsg}`,
      );
      throw error;
    }
  }
}
