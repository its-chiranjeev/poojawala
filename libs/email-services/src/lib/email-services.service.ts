import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  // TODO: This is for sendgrid
  // constructor() {
  //     sgMail.setApiKey(process.env['SENDGRID_API_KEY']!);
  // }

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      tls: {
        rejectUnauthorized: false,
      },
      auth: {
        user: process.env['SMTP_USERNAME'],
        pass: process.env['SMTP_PASSWORD'],
      },
      pool: true,
      maxConnections: 5,
    });
  }

  // TODO: This is for sendgrid
  // private async sendMail(options: {
  //     to: string | string[];
  //     subject: string;
  //     html: string;
  // }) {
  //     try {
  //         await sgMail.send({
  //             to: options.to,
  //             from: process.env['EMAIL_FROM']!,
  //             subject: options.subject,
  //             html: options.html,
  //         });
  //     } catch (error) {
  //         this.logger.error('SendGrid email failed', error);
  //         throw error;
  //     }
  // }

  // TODO:THis is for Nodemailer SMTP
  private async sendMail(options: {
    to: string | string[];
    subject: string;
    html: string;
  }) {
    try {
      await this.transporter.sendMail({
        from: process.env[`EMAIL_FROM`],
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
    } catch (error) {
      this.logger.error('SMTP email failed', error);
      throw error;
    }
  }

  async sendOtpEmail(email: string, otp: string, firstName?: string) {
    const html = `
            <div>
            <h2>Hello ${firstName ?? 'User'}</h2>
            <p>Your OTP code is:</p>
            <h1 style="letter-spacing:4px">${otp}</h1>
            <p>This code expires in 10 minutes.</p>
            </div>
        `;

    return this.sendMail({
      to: email,
      subject: 'Your OTP Code',
      html,
    });
  }
}
