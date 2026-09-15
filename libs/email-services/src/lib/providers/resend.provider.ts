import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface ResendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class ResendProvider {
  private readonly logger = new Logger(ResendProvider.name);
  private readonly resend: Resend;

  constructor() {
    const apiKey = process.env['RESEND_API_KEY'];
    // console.log(
    //   'RESEND_API_KEY:',
    //   apiKey ? apiKey.substring(0, 10) + '...' : 'NOT FOUND',
    // );
    // console.log('MAIL_FROM:', process.env['MAIL_FROM']);
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

    if (typeof toOrOptions === 'object' && !Array.isArray(toOrOptions)) {
      to = toOrOptions.to;
      emailSubject = toOrOptions.subject;
      emailHtml = toOrOptions.html;
    } else {
      to = toOrOptions;
      emailSubject = subject!;
      emailHtml = html!;
    }

    try {
      // console.log('========== Resend Request ==========');
      // console.log('MAIL_FROM:', process.env['MAIL_FROM']);
      // console.log('RESEND API KEY:', process.env['RESEND_API_KEY']);
      // console.log('TO:', to);
      // console.log('SUBJECT:', emailSubject);

      const response = await this.resend.emails.send({
        from: process.env['MAIL_FROM']!,
        to,
        subject: emailSubject,
        html: emailHtml,
      });

      if (!response || response.error) {
        const errorMessage =
          response?.error?.message || 'Empty or invalid response from Resend API';
        this.logger.error(`Failed to send email to ${to}: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      this.logger.log(
        `Email sent successfully to ${to}. Email ID: ${response.data?.id}`,
      );
      console.log('Resend Success Response:', response);

      return response;
    } catch (error) {
      console.error('Resend Error:', error);
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
