import { Injectable, Logger, Optional } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';
import { ResendProvider } from './providers/resend.provider';
import { renderPoojawalaEmail } from './templates/email-base.template';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export class EmailVerificationRepository { }

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  //   private transporter: nodemailer.Transporter;
  private readonly resendProvider: ResendProvider;

  // TODO: This is for sendgrid

  // constructor(
  //     private readonly emailVerificationRepo: EmailVerificationRepository,
  // ) {
  //     // Initialize SendGrid with API key
  //     sgMail.setApiKey(process.env['SENDGRID_API_KEY']!);
  // }

  // TODO: This is for Nodemailer SMTP
  // constructor() {
  //   this.transporter = nodemailer.createTransport({
  //     host: 'smtp.gmail.com',
  //     port: 587,
  //     secure: false,
  //     tls: {
  //       rejectUnauthorized: false,
  //     },
  //     auth: {
  //       user: process.env['SMTP_USERNAME'],
  //       pass: process.env['SMTP_PASSWORD'],
  //     },
  //     pool: true,
  //     maxConnections: 5,
  //   });
  // }

  constructor(
    @Optional() private readonly emailVerificationRepo?: EmailVerificationRepository,
    @Optional() resendProvider?: ResendProvider,
  ) {
    this.resendProvider = resendProvider || new ResendProvider();
  }

  // TODO: This is for sendgrid 

  // async sendMail(options: SendEmailOptions) {
  //     try {
  //         await sgMail.send({
  //             from: {
  //                 email: process.env['SMTP_FROM']!,
  //                 name: process.env['SMTP_FROM_NAME'] || 'Your App',
  //             },
  //             to: options.to,
  //             subject: options.subject,
  //             html: options.html,
  //         });

  //         this.logger.log(`Email sent successfully to ${options.to}`);
  //     } catch (error) {
  //         this.logger.error(`Failed to send email to ${options.to}`, error);
  //         throw error;
  //     }
  // }

  // TODO: This is for Nodemailer SMTP
  // private async sendMail(options: {
  //   to: string | string[];
  //   subject: string;
  //   html: string;
  // }) {
  //   try {
  //     await this.transporter.sendMail({
  //       from: process.env[`EMAIL_FROM`],
  //       to: options.to,
  //       subject: options.subject,
  //       html: options.html,
  //     });
  //   } catch (error) {
  //     this.logger.error('SMTP email failed', error);
  //     throw error;
  //   }
  // }

  async sendMail(options: SendEmailOptions) {
    return await this.resendProvider.sendMail(options);
  }

  async sendPurohitApprovalEmail(
    email: string,
    firstName?: string,
  ): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Profile Approved',
      userName: firstName || 'Purohit',
      preheaderText: 'Congratulations! Your Purohit Profile has been verified and approved.',
      emailMessage: 'Congratulations! Your Purohit profile and submitted documents have been successfully verified and approved by the Poojawala team.',
      highlight: {
        title: 'Account Active',
        text: 'Your account is now active. You can now access all Purohit features, accept sacred pooja booking assignments, and manage your schedule on the Poojawala platform.',
      },
    });

    await this.sendMail({
      to: email,
      subject: 'Your Purohit Profile Has Been Approved - Poojawala',
      html,
    });
  }

  async sendPurohitRejectionEmail(
    email: string,
    rejectionReason: string,
    firstName?: string,
  ): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Verification Notice',
      userName: firstName || 'Purohit',
      preheaderText: 'Update regarding your Purohit profile verification.',
      emailMessage: 'Thank you for your interest in joining Poojawala. After reviewing your submitted documents, your profile verification could not be approved at this time.',
      highlight: {
        title: 'Rejection Reason',
        text: rejectionReason || 'Document verification could not be completed. Please review your credentials and contact support.',
      },
    });

    await this.sendMail({
      to: email,
      subject: 'Your Purohit Profile Verification Was Rejected - Poojawala',
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

  async sendOtpEmail(email: string, otp: string, firstName?: string, purpose?: string): Promise<void> {
    const badge = purpose || 'OTP Verification';
    const html = renderPoojawalaEmail({
      statusBadge: badge,
      userName: firstName || 'Devotee',
      preheaderText: `Your verification OTP is ${otp}`,
      emailMessage: 'Use the One-Time Password (OTP) below to complete your verification and continue with your sacred journey on Poojawala.',
      otpCode: otp,
      otpSubtitle: 'Valid for 10 minutes. Do not share this code with anyone.',
    });

    try {
      this.logger.log(`Attempting to send OTP email to ${email}`);
      await this.sendMail({
        to: email,
        subject: `${badge} - Poojawala`,
        html,
      });
      this.logger.log(`OTP email sent successfully to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send OTP email to ${email}: ${error?.message || error}`,
        error?.stack,
      );
      throw error;
    }
  }

  async sendCustomerCreatedByAdminEmail(
    email: string,
    name: string,
    phone: string,
    address: string,
    city: string,
    plainPassword: string,
  ): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Account Created',
      userName: name || 'Devotee',
      preheaderText: 'Your Poojawala customer account has been created.',
      emailMessage: 'An administrator has created a Poojawala customer account for you. Welcome to our sacred pooja family!',
      detailsTable: {
        title: 'Account & Login Credentials',
        rows: [
          { label: 'Email / Username', value: email },
          { label: 'Phone', value: phone },
          { label: 'Address', value: `${address || ''}${address && city ? ', ' : ''}${city || ''}` },
          { label: 'Temporary Password', value: plainPassword, isHighlight: true },
        ],
      },
      highlight: {
        title: 'Security Notice',
        text: 'For your privacy and security, please log in and change your password immediately upon your first visit.',
      },
    });

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
    const html = renderPoojawalaEmail({
      statusBadge: 'Purohit Account Created',
      userName: name || 'Purohit',
      preheaderText: 'Your Poojawala Purohit account has been created.',
      emailMessage: 'An administrator has created a Poojawala Purohit account for you. Welcome to the sacred network of Vedic pandits!',
      detailsTable: {
        title: 'Account & Login Credentials',
        rows: [
          { label: 'Email', value: email },
          { label: 'Username', value: username },
          { label: 'Phone', value: phone },
          { label: 'Temporary Password', value: plainPassword, isHighlight: true },
        ],
      },
      highlight: {
        title: 'Next Steps to Complete Verification',
        text: 'For your security, please log in and change your password immediately. Next, go to your profile to upload your verification documents (Aadhaar, PAN, Certificate) and bank account details so Admin can approve your profile.',
      },
    });

    await this.sendMail({
      to: email,
      subject: 'Your Poojawala Purohit Account Has Been Created',
      html,
    });
  }

  async sendCustomerBookingConfirmationEmail(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    bookingAddress: string;
    purohitName: string;
    totalAmount: number;
    amountPaid: number;
    pendingAmount: number;
    paymentStatus: string;
    bookingStatus: string;
    specialInstructions?: string;
  }): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Booking Confirmed',
      userName: data.customerName || 'Devotee',
      preheaderText: `Booking #${data.bookingId} for ${data.serviceName} confirmed!`,
      emailMessage: `Your sacred pooja service for <strong>${this.escapeHtml(data.serviceName)}</strong> has been scheduled successfully.`,
      detailsTable: {
        title: 'Booking & Payment Details',
        rows: [
          { label: 'Booking ID', value: `#${data.bookingId}` },
          { label: 'pooja Service', value: data.serviceName },
          { label: 'Date', value: data.bookingDate },
          { label: 'Time', value: data.bookingTime },
          { label: 'pooja Location', value: data.bookingAddress },
          { label: 'Assigned Purohit', value: data.purohitName },
          { label: 'Amount Paid', value: `₹${data.amountPaid}` },
          { label: 'Pending Amount', value: `₹${data.pendingAmount}` },
          { label: 'Payment Status', value: data.paymentStatus, isHighlight: true },
          { label: 'Booking Status', value: data.bookingStatus },
        ],
        totalRow: {
          label: 'Total Amount',
          value: `₹${data.totalAmount}`,
        },
      },
      highlight: data.specialInstructions
        ? {
          title: 'Special Instructions',
          text: data.specialInstructions,
        }
        : {
          title: 'pooja Day Preparation',
          text: 'Please ensure basic household pooja essentials and a clean, quiet space are ready at least 15 minutes before the scheduled time.',
        },
    });

    await this.sendMail({
      to: data.email,
      subject: `Booking Confirmed - Poojawala | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendPurohitBookingAssignmentEmail(data: {
    email: string;
    purohitName: string;
    bookingId: string;
    customerName: string;
    customerPhone: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    bookingAddress: string;
    totalAmount: number;
    purohitPayoutAmount: number;
    paymentStatus: string;
    bookingStatus: string;
    specialInstructions?: string;
  }): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'New Booking Assigned',
      userName: data.purohitName || 'Purohit',
      preheaderText: `New Booking #${data.bookingId} assigned to you!`,
      emailMessage: `A new sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong> has been assigned to you. Please review the details below.`,
      detailsTable: {
        title: 'Booking & Devotee Details',
        rows: [
          { label: 'Booking ID', value: `#${data.bookingId}` },
          { label: 'Pooja Service', value: data.serviceName },
          { label: 'Date', value: data.bookingDate },
          { label: 'Time', value: data.bookingTime },
          { label: 'Pooja Location', value: data.bookingAddress },
          { label: 'Devotee Name', value: data.customerName },
          { label: 'Devotee Phone', value: data.customerPhone },
          { label: 'Total Booking Value', value: `₹${data.totalAmount}` },
          { label: 'Payment Status', value: data.paymentStatus },
          { label: 'Booking Status', value: data.bookingStatus },
        ],
        totalRow: {
          label: 'Your Payout',
          value: `₹${data.purohitPayoutAmount}`,
        },
      },
      highlight: data.specialInstructions
        ? {
          title: 'Devotee Instructions',
          text: data.specialInstructions,
        }
        : {
          title: 'Purohit Guidelines',
          text: 'Please arrive at the venue in traditional Vedic attire at least 15 minutes before the scheduled time with the necessary pooja samagri.',
        },
    });

    await this.sendMail({
      to: data.email,
      subject: `New Booking Assigned - Poojawala | Booking #${data.bookingId}`,
      html,
    });
  }
}
