import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

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
      maxMessages: 100,
    });
  }

  // Fixed: public async + NO export keyword inside class
  public async sendMail(to: string, subject: string, html: string) {
    return await this.transporter.sendMail({
      from: process.env['SMTP_USERNAME'],
      to,
      subject,
      html,
    });
  }
}
