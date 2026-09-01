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

  async sendPurohitApprovalEmail(
    email: string,
    firstName?: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hello ${this.escapeHtml(firstName ?? 'Purohit')},</h2>

        <p>
          Congratulations! Your Purohit profile and submitted documents
          have been successfully verified and approved.
        </p>

        <p>
          Your account is now active. You can access the available
          Purohit features on the Poojawala platform.
        </p>

        <p>
          Regards,<br />
          Poojawala Team
        </p>
      </div>
    `;

    await this.sendMail({
      to: email,
      subject: 'Your Purohit Profile Has Been Approved',
      html,
    });
  }

  async sendPurohitRejectionEmail(
    email: string,
    rejectionReason: string,
    firstName?: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hello ${this.escapeHtml(firstName ?? 'Purohit')},</h2>

        <p>
          Your Purohit profile verification has been rejected.
        </p>

        <div
          style="
            padding: 12px;
            border-left: 4px solid #d9534f;
            background-color: #f8f8f8;
            margin: 16px 0;
          "
        >
          <strong>Rejection reason:</strong>
          <p>${this.escapeHtml(rejectionReason)}</p>
        </div>

        <p>
          Please correct the mentioned issue before contacting
          the Poojawala support team for further review.
        </p>

        <p>
          Regards,<br />
          Poojawala Team
        </p>
      </div>
    `;

    await this.sendMail({
      to: email,
      subject: 'Your Purohit Profile Verification Was Rejected',
      html,
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  async sendCustomerCreatedByAdminEmail(
    email: string,
    name: string,
    phone: string,
    address: string,
    city: string,
    plainPassword: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hello ${this.escapeHtml(name)},</h2>

        <p>
          An administrator has created a Poojawala customer account for you!
        </p>
        
        <h3>Your Account Details:</h3>
        <ul>
          <li><strong>Email:</strong> ${this.escapeHtml(email)}</li>
          <li><strong>Phone:</strong> ${this.escapeHtml(phone)}</li>
          <li><strong>Address:</strong> ${this.escapeHtml(address)}, ${this.escapeHtml(city)}</li>
        </ul>

        <h3>Your Login Credentials:</h3>
        <p><strong>Password:</strong> ${this.escapeHtml(plainPassword)}</p>

        <p style="color: #d9534f; font-weight: bold;">
          For your privacy and security, please log in and change your password immediately.
        </p>

        <p>
          Regards,<br />
          Poojawala Team
        </p>
      </div>
    `;

    await this.sendMail({
      to: email,
      subject: 'Your Poojawala Account Has Been Created',
      html,
    });
  }

  async sendPurohitCreatedByAdminEmail(
    email: string,
    name: string,
    username: string,
    phone: string,
    plainPassword: string,
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hello ${this.escapeHtml(name)},</h2>

        <p>
          An administrator has created a Poojawala Purohit account for you!
        </p>
        
        <h3>Your Account Details:</h3>
        <ul>
          <li><strong>Email:</strong> ${this.escapeHtml(email)}</li>
          <li><strong>Username:</strong> ${this.escapeHtml(username)}</li>
          <li><strong>Phone:</strong> ${this.escapeHtml(phone)}</li>
        </ul>

        <h3>Your Login Credentials:</h3>
        <p><strong>Password:</strong> ${this.escapeHtml(plainPassword)}</p>

        <p style="color: #d9534f; font-weight: bold;">
          For your privacy and security, please log in and change your password immediately.
        </p>
        
        <p>
          Once logged in, please go to your profile to upload your verification documents (Aadhaar, PAN, Certificate) and add your Bank Account details so the Admin can approve your profile.
        </p>

        <p>
          Regards,<br />
          Poojawala Team
        </p>
      </div>
    `;

    await this.sendMail({
      to: email,
      subject: 'Your Poojawala Purohit Account Has Been Created',
      html,
    });
  }
}
