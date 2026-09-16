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

  async sendCustomerBookingAcceptedEmail(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    bookingAddress: string;
    purohitName: string;
    purohitPhone?: string;
    totalAmount?: number;
    bookingStatus?: string;
  }): Promise<void> {
    const rows = [
      { label: 'Booking ID', value: `#${data.bookingId}` },
      { label: 'Pooja Service', value: data.serviceName },
      { label: 'Date', value: data.bookingDate },
      { label: 'Time', value: data.bookingTime },
      { label: 'Pooja Location', value: data.bookingAddress },
      { label: 'Assigned Purohit', value: data.purohitName },
      ...(data.purohitPhone ? [{ label: 'Purohit Contact', value: data.purohitPhone }] : []),
      { label: 'Booking Status', value: data.bookingStatus || 'Accepted', isHighlight: true },
    ];

    const html = renderPoojawalaEmail({
      statusBadge: 'Booking Accepted',
      userName: data.customerName || 'Devotee',
      preheaderText: `Booking #${data.bookingId} has been accepted by Purohit ${data.purohitName}!`,
      emailMessage: `Your sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong> has been accepted by Purohit <strong>${this.escapeHtml(data.purohitName)}</strong>. Our verified Vedic purohit is preparing to conduct your rituals with complete devotion and Vedic sanctity.`,
      detailsTable: {
        title: 'Booking & Purohit Details',
        rows,
        ...(data.totalAmount !== undefined
          ? {
              totalRow: {
                label: 'Booking Amount',
                value: `₹${data.totalAmount}`,
              },
            }
          : {}),
      },
      highlight: {
        title: 'Next Steps for the Pooja',
        text: 'Your assigned Purohit will arrive at your venue (or connect for the online ritual) at least 15 minutes prior to the auspicious muhurat. Please ensure a clean and sanctified area is ready for the sacred ceremony.',
      },
    });

    await this.sendMail({
      to: data.email,
      subject: `Booking Accepted by Purohit - Poojawala | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendCustomerBookingCompletedEmail(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    purohitName: string;
    totalAmount: number;
    paymentStatus?: string;
  }): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Pooja Completed',
      userName: data.customerName || 'Devotee',
      preheaderText: `Your sacred pooja #${data.bookingId} has been completed successfully!`,
      emailMessage: `May the divine blessings of your <strong>${this.escapeHtml(data.serviceName)}</strong> bring peace, prosperity, and happiness to you and your loved ones. The sacred ceremony has been completed and your payment has been processed successfully.`,
      detailsTable: {
        title: 'Ceremony & Payment Summary',
        rows: [
          { label: 'Booking ID', value: `#${data.bookingId}` },
          { label: 'Pooja Service', value: data.serviceName },
          { label: 'Conducted By', value: data.purohitName },
          { label: 'Date', value: data.bookingDate },
          { label: 'Time', value: data.bookingTime },
          { label: 'Payment Status', value: data.paymentStatus || 'Paid & Settled', isHighlight: true },
          { label: 'Booking Status', value: 'Completed' },
        ],
        totalRow: {
          label: 'Total Paid',
          value: `₹${data.totalAmount}`,
        },
      },
      highlight: {
        title: 'Divine Blessings & Feedback',
        text: 'Thank you for choosing Poojawala for your sacred ceremonies. We welcome your blessings and valuable feedback. Please visit your dashboard to rate your experience with your Purohit.',
      },
    });

    await this.sendMail({
      to: data.email,
      subject: `Pooja Completed Successfully - Poojawala | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendCustomerRegistrationEmail(data: {
    email: string;
    name: string;
    username?: string;
    phone?: string;
  }): Promise<void> {
    const rows = [
      { label: 'Name', value: data.name || 'Devotee' },
      { label: 'Email', value: data.email },
      ...(data.username ? [{ label: 'Username', value: data.username }] : []),
      ...(data.phone ? [{ label: 'Phone', value: data.phone }] : []),
      { label: 'Account Status', value: 'Active', isHighlight: true },
    ];

    const html = renderPoojawalaEmail({
      statusBadge: 'Welcome to Poojawala',
      userName: data.name || 'Devotee',
      preheaderText: 'Welcome to Poojawala! Your account has been registered successfully.',
      emailMessage: 'Welcome to the Poojawala family! Your customer account has been successfully created. You can now explore Vedic pooja services, book verified purohits, and schedule sacred ceremonies with ease.',
      detailsTable: {
        title: 'Account Summary',
        rows,
      },
      highlight: {
        title: 'Start Your Sacred Journey',
        text: 'Browse through a wide range of authentic Vedic poojas, havans, and rituals performed by certified pandits at your doorstep, temple, or online via live streaming.',
      },
    });

    await this.sendMail({
      to: data.email,
      subject: 'Welcome to Poojawala - Your Sacred Journey Begins',
      html,
    });
  }

  async sendPurohitRegistrationEmail(data: {
    email: string;
    name: string;
    username?: string;
    phone?: string;
  }): Promise<void> {
    const rows = [
      { label: 'Purohit Name', value: data.name || 'Purohit' },
      { label: 'Email', value: data.email },
      ...(data.username ? [{ label: 'Username', value: data.username }] : []),
      ...(data.phone ? [{ label: 'Phone', value: data.phone }] : []),
      { label: 'Profile Status', value: 'Under Review', isHighlight: true },
    ];

    const html = renderPoojawalaEmail({
      statusBadge: 'Registration Received',
      userName: data.name || 'Purohit',
      preheaderText: 'Thank you for registering as a Purohit with Poojawala.',
      emailMessage: 'Thank you for joining Poojawala as a Vedic Purohit. Your registration and verification details have been received successfully. Our administrative team is currently reviewing your profile and credentials.',
      detailsTable: {
        title: 'Registration Details',
        rows,
      },
      highlight: {
        title: 'Verification Process',
        text: 'Our team verifies all credentials to maintain the highest standards of Vedic sanctity. Once your documents are verified and approved by the admin team, you will receive an activation email and can begin accepting booking requests.',
      },
    });

    await this.sendMail({
      to: data.email,
      subject: 'Purohit Registration Received - Poojawala',
      html,
    });
  }
}
