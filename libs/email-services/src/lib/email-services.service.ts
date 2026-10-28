import { Injectable, Logger, Optional } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';
import { ResendProvider } from './providers/resend.provider';
import { renderPoojawalaEmail, EmailTableRow } from './templates/email-base.template';
import { platformBrandName, getPlatformWebsiteUrl } from './config/platform.config';

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
      emailMessage: `Congratulations! Your Purohit profile and submitted documents have been successfully verified and approved by the ${platformBrandName} team.`,
      highlight: {
        title: 'Account Active',
        text: `Your account is now active. You can now access all Purohit features, accept sacred pooja booking assignments, and manage your schedule on the ${platformBrandName} platform.`,
      },
    });

    await this.sendMail({
      to: email,
      subject: `Your Purohit Profile Has Been Approved - ${platformBrandName}`,
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
      emailMessage: `Thank you for your interest in joining ${platformBrandName}. After reviewing your submitted documents, your profile verification could not be approved at this time.`,
      highlight: {
        title: 'Rejection Reason',
        text: rejectionReason || 'Document verification could not be completed. Please review your credentials and contact support.',
      },
    });

    await this.sendMail({
      to: email,
      subject: `Your Purohit Profile Verification Was Rejected - ${platformBrandName}`,
      html,
    });
  }

  async sendAstrologerApprovalEmail(
    email: string,
    firstName?: string,
  ): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Profile Approved',
      userName: firstName || 'Astrologer',
      preheaderText: 'Congratulations! Your Astrologer Profile has been verified and approved.',
      emailMessage: `Congratulations! Your Astrologer profile and submitted documents have been successfully verified and approved by the ${platformBrandName} team.`,
      highlight: {
        title: 'Account Active',
        text: `Your account is now active. You can now access all Astrologer features, take astrology consultations, and manage your schedule on the ${platformBrandName} platform.`,
      },
    });

    await this.sendMail({
      to: email,
      subject: `Your Astrologer Profile Has Been Approved - ${platformBrandName}`,
      html,
    });
  }

  async sendAstrologerRejectionEmail(
    email: string,
    rejectionReason: string,
    firstName?: string,
  ): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Verification Notice',
      userName: firstName || 'Astrologer',
      preheaderText: 'Update regarding your Astrologer profile verification.',
      emailMessage: `Thank you for your interest in joining ${platformBrandName}. After reviewing your submitted documents, your profile verification could not be approved at this time.`,
      highlight: {
        title: 'Rejection Reason',
        text: rejectionReason || 'Document verification could not be completed. Please review your credentials and contact support.',
      },
    });

    await this.sendMail({
      to: email,
      subject: `Your Astrologer Profile Verification Was Rejected - ${platformBrandName}`,
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
      emailMessage: `Use the One-Time Password (OTP) below to complete your verification and continue with your sacred journey on ${platformBrandName}.`,
      otpCode: otp,
      otpSubtitle: 'Valid for 10 minutes. Do not share this code with anyone.',
    });

    try {
      this.logger.log(`Attempting to send OTP email to ${email}`);
      await this.sendMail({
        to: email,
        subject: `${badge} - ${platformBrandName}`,
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
      preheaderText: `Your ${platformBrandName} customer account has been created.`,
      emailMessage: `An administrator has created a ${platformBrandName} customer account for you. Welcome to our sacred pooja family!`,
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
      subject: `Your ${platformBrandName} Account Has Been Created`,
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
      preheaderText: `Your ${platformBrandName} Purohit account has been created.`,
      emailMessage: `An administrator has created a ${platformBrandName} Purohit account for you. Welcome to the sacred network of Vedic pandits!`,
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
      subject: `Your ${platformBrandName} Purohit Account Has Been Created`,
      html,
    });
  }

  async sendAstrologerCreatedByAdminEmail(
    email: string,
    name: string,
    username: string,
    phone: string,
    plainPassword: string,
  ): Promise<void> {
    const html = renderPoojawalaEmail({
      statusBadge: 'Astrologer Account Created',
      userName: name || 'Astrologer',
      preheaderText: `Your ${platformBrandName} Astrologer account has been created.`,
      emailMessage: `An administrator has created a ${platformBrandName} Astrologer account for you. Welcome to the sacred network of Vedic astrologers!`,
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
        text: 'For your security, please log in and change your password immediately. Next, go to your profile to review your profile and verification documents.',
      },
    });

    await this.sendMail({
      to: email,
      subject: `Your ${platformBrandName} Astrologer Account Has Been Created`,
      html,
    });
  }

  async sendCustomerBookingConfirmationEmail(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    servicePlan?: string;
    planName?: string;
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
    const effectivePlan = data.planName || data.servicePlan;
    const planText = effectivePlan ? ` - ${effectivePlan} Plan` : '';

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // preheaderText: `Booking #${data.bookingId} for ${data.serviceName} confirmed!`,
    // emailMessage: `Your sacred pooja service for <strong>${this.escapeHtml(data.serviceName)}</strong> has been scheduled successfully.`,
    const preheaderText = `Booking #${data.bookingId} for ${data.serviceName}${planText} confirmed!`;
    const emailMessage = `Your sacred pooja service for <strong>${this.escapeHtml(data.serviceName)}</strong>${effectivePlan ? ` (<strong>${this.escapeHtml(effectivePlan)} Plan</strong>)` : ''} has been scheduled successfully.`;

    const html = renderPoojawalaEmail({
      statusBadge: 'Booking Confirmed',
      userName: data.customerName || 'Devotee',
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Booking & Payment Details',
        rows: [
          { label: 'Booking ID', value: `#${data.bookingId}` },
          { label: 'Pooja Service', value: data.serviceName },
          ...(effectivePlan ? [{ label: 'Service Plan', value: `${effectivePlan} Plan` }] : []),
          { label: 'Date', value: data.bookingDate },
          { label: 'Time', value: data.bookingTime },
          { label: 'Pooja Location', value: data.bookingAddress },
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
          title: 'Pooja Day Preparation',
          text: 'Please ensure basic household pooja essentials and a clean, quiet space are ready at least 15 minutes before the scheduled time.',
        },
    });

    await this.sendMail({
      to: data.email,
      subject: `Booking Confirmed - ${platformBrandName} | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendPurohitBookingAssignmentEmail(data: {
    email: string;
    purohitName: string;
    bookingId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    bookingMode?: string;
    serviceName: string;
    servicePlan?: string;
    planName?: string;
    bookingDate: string;
    bookingTime: string;
    bookingAddress: string;
    totalAmount: number;
    purohitPayoutAmount: number;
    paymentStatus: string;
    bookingStatus: string;
    specialInstructions?: string;
  }): Promise<void> {
    const isOnline = data.bookingMode === 'ONLINE';
    const effectivePlan = data.planName || data.servicePlan;
    const planText = effectivePlan ? ` - ${effectivePlan} Plan` : '';

    const preheaderText = isOnline
      ? `New Online Booking #${data.bookingId} (${data.serviceName}${planText}) assigned to you!`
      : `New Booking #${data.bookingId} (${data.serviceName}${planText}) assigned to you!`;

    const emailMessage = isOnline
      ? `A new online sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong>${effectivePlan ? ` (<strong>${this.escapeHtml(effectivePlan)} Plan</strong>)` : ''} has been assigned to you. Please review the devotee contact details below and connect with the customer to coordinate the online session.`
      : `A new sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong>${effectivePlan ? ` (<strong>${this.escapeHtml(effectivePlan)} Plan</strong>)` : ''} has been assigned to you. Please review the details below.`;

    const statusBadge = isOnline ? 'Online Booking Assigned' : 'New Booking Assigned';

    const defaultHighlight = isOnline
      ? {
          title: 'Online Pooja Guidelines',
          text: 'This is an online pooja session. Please connect with the devotee in advance using their contact details to coordinate the video/audio call link and necessary preparations.',
        }
      : {
          title: 'Purohit Guidelines',
          text: 'Please arrive at the venue in traditional Vedic attire at least 15 minutes before the scheduled time with the necessary pooja samagri.',
        };

    const detailsRows: { label: string; value: string }[] = [
      { label: 'Booking ID', value: `#${data.bookingId}` },
      { label: 'Pooja Service', value: data.serviceName },
      ...(effectivePlan ? [{ label: 'Service Plan', value: `${effectivePlan} Plan` }] : []),
      ...(data.bookingMode ? [{ label: 'Mode', value: isOnline ? 'Online (Worldwide)' : 'Offline (In-Person)' }] : []),
      { label: 'Date', value: data.bookingDate },
      { label: 'Time', value: data.bookingTime },
      { label: 'Pooja Location', value: data.bookingAddress },
      { label: 'Devotee Name', value: data.customerName },
      { label: 'Devotee Phone', value: data.customerPhone },
      ...(data.customerEmail ? [{ label: 'Devotee Email', value: data.customerEmail }] : []),
      { label: 'Total Booking Value', value: `₹${data.totalAmount}` },
      { label: 'Payment Status', value: data.paymentStatus },
      { label: 'Booking Status', value: data.bookingStatus },
    ];

    const html = renderPoojawalaEmail({
      statusBadge,
      userName: data.purohitName || 'Purohit',
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Booking & Devotee Details',
        rows: detailsRows,
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
        : defaultHighlight,
    });

    await this.sendMail({
      to: data.email,
      subject: `${isOnline ? 'Online Booking' : 'New Booking'} Assigned - ${platformBrandName} | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendCustomerBookingAcceptedEmail(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    servicePlan?: string;
    planName?: string;
    bookingDate: string;
    bookingTime: string;
    bookingAddress: string;
    purohitName: string;
    purohitPhone?: string;
    totalAmount?: number;
    bookingStatus?: string;
  }): Promise<void> {
    const effectivePlan = data.planName || data.servicePlan;
    const planText = effectivePlan ? ` - ${effectivePlan} Plan` : '';

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // preheaderText: `Booking #${data.bookingId} has been accepted by Purohit ${data.purohitName}!`,
    // emailMessage: `Your sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong> has been accepted by Purohit <strong>${this.escapeHtml(data.purohitName)}</strong>. Our verified Vedic purohit is preparing to conduct your rituals with complete devotion and Vedic sanctity.`,
    const preheaderText = `Booking #${data.bookingId} for ${data.serviceName}${planText} has been accepted by Purohit ${data.purohitName}!`;
    const emailMessage = `Your sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong>${effectivePlan ? ` (<strong>${this.escapeHtml(effectivePlan)} Plan</strong>)` : ''} has been accepted by Purohit <strong>${this.escapeHtml(data.purohitName)}</strong>. Our verified Vedic purohit is preparing to conduct your rituals with complete devotion and Vedic sanctity.`;

    const rows = [
      { label: 'Booking ID', value: `#${data.bookingId}` },
      { label: 'Pooja Service', value: data.serviceName },
      ...(effectivePlan ? [{ label: 'Service Plan', value: `${effectivePlan} Plan` }] : []),
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
      preheaderText,
      emailMessage,
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
      subject: `Booking Accepted by Purohit - ${platformBrandName} | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendCustomerBookingCompletedEmail(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    servicePlan?: string;
    planName?: string;
    bookingDate: string;
    bookingTime: string;
    purohitName: string;
    totalAmount: number;
    paymentStatus?: string;
  }): Promise<void> {
    const effectivePlan = data.planName || data.servicePlan;
    const planText = effectivePlan ? ` - ${effectivePlan} Plan` : '';

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // preheaderText: `Your sacred pooja #${data.bookingId} has been completed successfully!`,
    // emailMessage: `May the divine blessings of your <strong>${this.escapeHtml(data.serviceName)}</strong> bring peace, prosperity, and happiness to you and your loved ones. The sacred ceremony has been completed and your payment has been processed successfully.`,
    const preheaderText = `Your sacred pooja #${data.bookingId} for ${data.serviceName}${planText} has been completed successfully!`;
    const emailMessage = `May the divine blessings of your <strong>${this.escapeHtml(data.serviceName)}</strong>${effectivePlan ? ` (<strong>${this.escapeHtml(effectivePlan)} Plan</strong>)` : ''} bring peace, prosperity, and happiness to you and your loved ones. The sacred ceremony has been completed and your payment has been processed successfully.`;

    const html = renderPoojawalaEmail({
      statusBadge: 'Pooja Completed',
      userName: data.customerName || 'Devotee',
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Ceremony & Payment Summary',
        rows: [
          { label: 'Booking ID', value: `#${data.bookingId}` },
          { label: 'Pooja Service', value: data.serviceName },
          ...(effectivePlan ? [{ label: 'Service Plan', value: `${effectivePlan} Plan` }] : []),
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
        text: `Thank you for choosing ${platformBrandName} for your sacred ceremonies. We welcome your blessings and valuable feedback. Please visit your dashboard to rate your experience with your Purohit.`,
      },
    });

    await this.sendMail({
      to: data.email,
      subject: `Pooja Completed Successfully - ${platformBrandName} | Booking #${data.bookingId}`,
      html,
    });
  }

  async sendServiceActionEmail(data: {
    email: string;
    serviceName: string;
    action: string;
    planName?: string;
  }): Promise<void> {
    const planText = data.planName ? ` - ${data.planName} plan` : '';
    const actionPast = data.action.endsWith('e') || data.action.endsWith('ed') ? (data.action.endsWith('ed') ? data.action : `${data.action}d`) : `${data.action}ed`;
    const messageContent = `Service '${data.serviceName}'${planText} was ${actionPast.toLowerCase()} successfully.`;

    const html = renderPoojawalaEmail({
      statusBadge: `Service ${actionPast}`,
      userName: 'Administrator',
      preheaderText: messageContent,
      emailMessage: messageContent,
      detailsTable: {
        title: 'Service Update Details',
        rows: [
          { label: 'Service Name', value: data.serviceName },
          { label: 'Action', value: actionPast },
          ...(data.planName ? [{ label: 'Service Plan', value: `${data.planName} Plan` }] : []),
        ],
      },
    });

    await this.sendMail({
      to: data.email,
      subject: `Service ${actionPast} - ${data.serviceName}`,
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
      statusBadge: `Welcome to ${platformBrandName}`,
      userName: data.name || 'Devotee',
      preheaderText: `Welcome to ${platformBrandName}! Your account has been registered successfully.`,
      emailMessage: `Welcome to the ${platformBrandName} family! Your customer account has been successfully created. You can now explore Vedic pooja services, book verified purohits, and schedule sacred ceremonies with ease.`,
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
      subject: `Welcome to ${platformBrandName} - Your Sacred Journey Begins`,
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
      preheaderText: `Thank you for registering as a Purohit with ${platformBrandName}.`,
      emailMessage: `Thank you for joining ${platformBrandName} as a Vedic Purohit. Your registration and verification details have been received successfully. Our administrative team is currently reviewing your profile and credentials.`,
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
      subject: `Purohit Registration Received - ${platformBrandName}`,
      html,
    });
  }

  async sendContactUsReplyEmail(data: {
    email: string;
    name: string;
    status: string;
    adminMessage: string;
    subject?: string;
    userOriginalMessage?: string;
    preferredDateTime?: Date | string | null;
    address?: string | null;
    service?: {
      id?: number;
      name?: string;
      slug?: string | null;
      isOnline?: boolean;
      isOffline?: boolean;
      iconUrl?: string | null;
    } | null;
  }): Promise<void> {
    const service = data.service;
    const isServiceQuery = Boolean(service && (service.name || service.id));

    let modeText = '';
    let modeBadgeHtml = '';
    let statusBadge = `Inquiry ${data.status}`;
    let preheaderText = `Update regarding your contact request (${data.status}) - ${platformBrandName}`;
    let emailSubject = `Update on your contact inquiry [${data.status}] - ${platformBrandName}`;
    let emailMessage = `Thank you for contacting ${platformBrandName}. Our administrative team has reviewed your query regarding "<strong>${this.escapeHtml(data.subject || 'Inquiry')}</strong>" and updated its status to <strong>${this.escapeHtml(data.status)}</strong>. Please find our response below:`;
    let detailsTableTitle = 'Inquiry Details';

    if (isServiceQuery && service?.name) {
      const isOnline = Boolean(service.isOnline);
      const isOffline = Boolean(service.isOffline);

      if (isOnline && isOffline) {
        modeText = 'Online & Offline (In-Person)';
        modeBadgeHtml = `<span style="display: inline-block; background-color: #E8F5E9; color: #2E7D32; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; border: 1px solid #C8E6C9; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 6px;">🌐 Online</span><span style="display: inline-block; background-color: #FFF3E0; color: #E65100; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; border: 1px solid #FFCC80; text-transform: uppercase; letter-spacing: 0.5px;">🏛️ Offline</span>`;
        statusBadge = `Service Inquiry (${data.status})`;
      } else if (isOnline) {
        modeText = 'Online Puja';
        modeBadgeHtml = `<span style="display: inline-block; background-color: #E8F5E9; color: #2E7D32; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1px solid #C8E6C9; text-transform: uppercase; letter-spacing: 0.5px;">🌐 Online</span>`;
        statusBadge = `Online Service Inquiry - ${data.status}`;
      } else if (isOffline) {
        modeText = 'Offline (In-Person)';
        modeBadgeHtml = `<span style="display: inline-block; background-color: #FFF3E0; color: #E65100; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1px solid #FFCC80; text-transform: uppercase; letter-spacing: 0.5px;">🏛️ Offline</span>`;
        statusBadge = `Offline Service Inquiry - ${data.status}`;
      } else {
        modeText = 'Standard Service';
        modeBadgeHtml = `<span style="display: inline-block; background-color: #F5F5F5; color: #616161; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1px solid #E0E0E0; text-transform: uppercase; letter-spacing: 0.5px;">Standard</span>`;
        statusBadge = `Service Inquiry - ${data.status}`;
      }

      preheaderText = `Update regarding your inquiry for ${service.name} (${data.status}) - ${platformBrandName}`;
      emailSubject = `Update on your inquiry for ${service.name} [${data.status}] - ${platformBrandName}`;
      emailMessage = `Thank you for contacting ${platformBrandName}. Our administrative team has reviewed your query regarding the sacred service "<strong>${this.escapeHtml(service.name)}</strong>"${data.subject ? ` (Subject: <em>${this.escapeHtml(data.subject)}</em>)` : ''} and updated its status to <strong>${this.escapeHtml(data.status)}</strong>. Please find our response and service details below:`;
      detailsTableTitle = 'Service & Inquiry Details';
    }

    let formattedPreferredDateTime: string | undefined = undefined;
    if (data.preferredDateTime) {
      if (data.preferredDateTime instanceof Date) {
        if (!isNaN(data.preferredDateTime.getTime())) {
          formattedPreferredDateTime = data.preferredDateTime.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        }
      } else if (typeof data.preferredDateTime === 'string') {
        const parsed = new Date(data.preferredDateTime);
        if (!isNaN(parsed.getTime())) {
          formattedPreferredDateTime = parsed.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        } else {
          formattedPreferredDateTime = data.preferredDateTime;
        }
      }
    }

    const rows: EmailTableRow[] = [
      { label: 'Name', value: data.name || 'Valued User' },
      ...(isServiceQuery && service?.name
        ? [
            { label: 'Inquiry Category', value: 'Service Query', isHighlight: true },
          ]
        : []),
      { label: 'Inquiry Status', value: data.status, isHighlight: true },
      ...(data.subject ? [{ label: 'Subject', value: data.subject }] : []),
      ...(formattedPreferredDateTime
        ? [{ label: 'Preferred Date & Time', value: formattedPreferredDateTime }]
        : []),
      ...(data.address ? [{ label: 'Address', value: data.address }] : []),
      ...(data.userOriginalMessage
        ? [{ label: 'Your Original Query', value: data.userOriginalMessage }]
        : []),
    ];

    let additionalContentHtml: string | undefined = undefined;
    if (isServiceQuery && service?.name) {
      additionalContentHtml = `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFFFF; border: 1.5px solid #FFDFC7; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 14px rgba(255, 98, 0, 0.05);">
          <tr>
            <td style="padding: 16px 20px; background-color: #FFF9F4; border-bottom: 1px solid #FFEADB;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 700; color: #8C6A5A; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px;">
                      Inquired Service
                    </div>
                    <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #D32F2F; font-family: 'Outfit', -apple-system, sans-serif;">
                      🪔 ${this.escapeHtml(service.name)}
                    </h3>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    ${modeBadgeHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            service.slug
              ? `
          <tr>
            <td style="padding: 14px 20px; background-color: #FFFFFF; text-align: right;">
              <a href="${getPlatformWebsiteUrl()}/services/${service.slug}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #FF6200 0%, #D32F2F 100%); color: #FFFFFF; font-size: 12px; font-weight: 700; padding: 8px 18px; border-radius: 20px; text-decoration: none; box-shadow: 0 2px 8px rgba(255, 98, 0, 0.25);">
                Explore Service Details &rarr;
              </a>
            </td>
          </tr>
          `
              : ''
          }
        </table>
      `;
    }

    const html = renderPoojawalaEmail({
      statusBadge,
      userName: data.name || 'Devotee',
      preheaderText,
      emailMessage,
      detailsTable: {
        title: detailsTableTitle,
        rows,
      },
      highlight: {
        title: `Response from ${platformBrandName} Team`,
        text: data.adminMessage,
      },
      additionalContentHtml,
    });

    await this.sendMail({
      to: data.email,
      subject: emailSubject,
      html,
    });
  }

  async sendAstrologerRegistrationEmail(data: {
    email: string;
    name: string;
    username?: string;
    phone?: string;
  }): Promise<void> {
    const rows: EmailTableRow[] = [
      { label: 'Astrologer Name', value: data.name || 'Astrologer' },
      { label: 'Email', value: data.email },
      ...(data.username ? [{ label: 'Username', value: data.username }] : []),
      ...(data.phone ? [{ label: 'Phone', value: data.phone }] : []),
      { label: 'Profile Status', value: 'Under Review', isHighlight: true },
    ];

    const html = renderPoojawalaEmail({
      statusBadge: 'Registration Received',
      userName: data.name || 'Astrologer',
      preheaderText: `Thank you for registering as an Astrologer with ${platformBrandName}.`,
      emailMessage: `Thank you for joining ${platformBrandName} as a Vedic Astrologer. Your registration and verification details have been received successfully. Our administrative team is currently reviewing your profile and credentials.`,
      detailsTable: {
        title: 'Registration Details',
        rows,
      },
      highlight: {
        title: 'Verification Process',
        text: 'Our team verifies all credentials to maintain the highest standards of Vedic consultations. Once your documents are verified and approved by the admin team, you will receive an activation email and can begin accepting astrology consultation bookings.',
      },
    });

    await this.sendMail({
      to: data.email,
      subject: `Astrologer Registration Received - ${platformBrandName}`,
      html,
    });
  }

  async sendBookingCancellationEmailToCustomer(data: {
    email: string;
    customerName: string;
    bookingId: string;
    serviceName: string;
    servicePlan?: string;
    bookingDate: string;
    bookingTime: string;
    cancelledBy: string; // 'PUROHIT' | 'ASTROLOGER' | 'ADMIN' | 'CUSTOMER'
    cancellationReason?: string;
    isAstrology?: boolean;
    providerName?: string;
  }): Promise<void> {
    const isPurohitRelease = data.cancelledBy === 'PUROHIT';
    const isAstrology = Boolean(data.isAstrology);

    let statusBadge: string;
    let subject: string;
    let preheaderText: string;
    let emailMessage: string;
    let highlightTitle: string;
    let highlightText: string;

    if (isPurohitRelease) {
      statusBadge = 'Booking Released';
      subject = `Booking Update - ${platformBrandName} | Booking #${data.bookingId}`;
      preheaderText = `Booking #${data.bookingId} was released by the assigned Purohit.`;
      emailMessage = `Your booking for <strong>${this.escapeHtml(data.serviceName)}</strong> was released by the assigned Purohit. We are finding an eligible Purohit for your booking. Please wait some time.`;
      highlightTitle = 'What happens next?';
      highlightText = 'Our system is reassigning your booking to available eligible Vedic Purohits. You will receive an update as soon as a new Purohit accepts your booking.';
    } else if (isAstrology) {
      statusBadge = 'Consultation Cancelled';
      subject = `Astrology Consultation Cancelled - ${platformBrandName} | Booking #${data.bookingId}`;
      preheaderText = `Your astrology consultation #${data.bookingId} has been cancelled.`;
      emailMessage = `Your astrology consultation booking (Booking #${data.bookingId})${data.providerName ? ` with Astrologer <strong>${this.escapeHtml(data.providerName)}</strong>` : ''} has been cancelled by ${data.cancelledBy === 'ASTROLOGER' ? 'the assigned Astrologer' : 'Admin'}.`;
      highlightTitle = 'Cancellation Reason';
      highlightText = data.cancellationReason || 'No specific cancellation reason was provided. If you have already made a payment, our support team will initiate your refund.';
    } else {
      statusBadge = 'Booking Cancelled';
      subject = `Booking Cancelled - ${platformBrandName} | Booking #${data.bookingId}`;
      preheaderText = `Your booking #${data.bookingId} has been cancelled.`;
      emailMessage = `Your sacred pooja booking for <strong>${this.escapeHtml(data.serviceName)}</strong> (Booking #${data.bookingId}) has been cancelled by ${data.cancelledBy === 'ADMIN' ? 'Admin' : 'Customer'}.`;
      highlightTitle = 'Cancellation Reason';
      highlightText = data.cancellationReason || 'Booking has been cancelled. If any refund is applicable, it will be processed according to our cancellation and refund policy.';
    }

    const rows: EmailTableRow[] = [
      { label: 'Booking ID', value: `#${data.bookingId}` },
      { label: isAstrology ? 'Service' : 'Pooja Service', value: data.serviceName },
      ...(data.servicePlan ? [{ label: 'Service Plan', value: `${data.servicePlan} Plan` }] : []),
      { label: 'Date', value: data.bookingDate },
      { label: 'Time', value: data.bookingTime },
      ...(data.providerName ? [{ label: isAstrology ? 'Astrologer' : 'Purohit', value: data.providerName }] : []),
      { label: 'Cancelled By', value: data.cancelledBy, isHighlight: true },
      ...(data.cancellationReason ? [{ label: 'Reason', value: data.cancellationReason }] : []),
      { label: 'Booking Status', value: isPurohitRelease ? 'Pending Reassignment' : 'Cancelled' },
    ];

    const html = renderPoojawalaEmail({
      statusBadge,
      userName: data.customerName || 'Devotee',
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Booking Details',
        rows,
      },
      highlight: {
        title: highlightTitle,
        text: highlightText,
      },
    });

    await this.sendMail({
      to: data.email,
      subject,
      html,
    });
  }

  async sendBookingCancellationEmailToProvider(data: {
    email: string;
    providerName: string;
    providerRole: 'Purohit' | 'Astrologer';
    bookingId: string;
    customerName: string;
    serviceName: string;
    servicePlan?: string;
    bookingDate: string;
    bookingTime: string;
    cancellationReason?: string;
    cancelledBy?: string;
  }): Promise<void> {
    const isAstrology = data.providerRole === 'Astrologer';
    const cancelledByLabel = data.cancelledBy === 'ADMIN' ? 'Admin' : 'Customer';
    const statusBadge = isAstrology ? 'Consultation Cancelled' : 'Booking Cancelled';
    const subject = isAstrology
      ? `Astrology Consultation Cancelled by ${cancelledByLabel} - ${platformBrandName} | Booking #${data.bookingId}`
      : `Booking Cancelled by ${cancelledByLabel} - ${platformBrandName} | Booking #${data.bookingId}`;
    const preheaderText = `Booking #${data.bookingId} has been cancelled by ${cancelledByLabel}.`;
    const emailMessage = isAstrology
      ? `An astrology consultation (Booking #${data.bookingId}) scheduled with devotee <strong>${this.escapeHtml(data.customerName)}</strong> has been cancelled by ${cancelledByLabel}.`
      : `Sacred pooja booking #${data.bookingId} for <strong>${this.escapeHtml(data.serviceName)}</strong> with devotee <strong>${this.escapeHtml(data.customerName)}</strong> has been cancelled by ${cancelledByLabel}.`;

    const rows: EmailTableRow[] = [
      { label: 'Booking ID', value: `#${data.bookingId}` },
      { label: isAstrology ? 'Service' : 'Pooja Service', value: data.serviceName },
      ...(data.servicePlan ? [{ label: 'Service Plan', value: `${data.servicePlan} Plan` }] : []),
      { label: 'Scheduled Date', value: data.bookingDate },
      { label: 'Scheduled Time', value: data.bookingTime },
      { label: 'Devotee Name', value: data.customerName },
      { label: 'Cancelled By', value: cancelledByLabel, isHighlight: true },
      ...(data.cancellationReason ? [{ label: 'Reason', value: data.cancellationReason }] : []),
      { label: 'Booking Status', value: 'Cancelled' },
    ];

    const html = renderPoojawalaEmail({
      statusBadge,
      userName: data.providerName || data.providerRole,
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Cancelled Booking Details',
        rows,
      },
      highlight: {
        title: 'Schedule Released',
        text: `Your schedule for this time slot has been released. You are now available to receive new ${isAstrology ? 'astrology consultation requests' : 'pooja assignments'}.`,
      },
    });

    await this.sendMail({
      to: data.email,
      subject,
      html,
    });
  }

  async sendRefundEmail(data: {
    email: string;
    customerName?: string;
    amount: number;
    currency?: string;
    refundId: string | number;
    bookingNumber?: string;
    reason?: string;
    status: string;
  }): Promise<void> {
    const isSuccess = data.status === 'SUCCESS' || data.status === 'processed';
    const statusBadge = isSuccess ? 'Refund Processed' : 'Refund Initiated';
    const formattedAmount = `₹${data.amount.toFixed(2)}`;
    const subject = `Refund Confirmation - ${formattedAmount} - ${platformBrandName}`;
    const preheaderText = `Your refund of ${formattedAmount} has been ${isSuccess ? 'processed' : 'initiated'}.`;
    const emailMessage = `A refund of <strong>${formattedAmount}</strong> has been ${isSuccess ? 'processed successfully' : 'initiated'} for your payment.`;

    const rows: EmailTableRow[] = [
      { label: 'Refund Amount', value: formattedAmount, isHighlight: true },
      { label: 'Refund Reference', value: `#${data.refundId}` },
      ...(data.bookingNumber ? [{ label: 'Booking Number', value: `#${data.bookingNumber}` }] : []),
      { label: 'Status', value: isSuccess ? 'Processed' : 'Initiated', isHighlight: true },
      ...(data.reason ? [{ label: 'Reason', value: data.reason }] : []),
    ];

    const html = renderPoojawalaEmail({
      statusBadge,
      userName: data.customerName || 'Devotee',
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Refund Summary',
        rows,
      },
      highlight: {
        title: 'Credit Timeline',
        text: 'The refunded amount will be credited back to your original source payment method within 5-7 business days, depending on your bank.',
      },
    });

    await this.sendMail({
      to: data.email,
      subject,
      html,
    });
  }

  async sendTempleApprovalEmail(data: {
    email: string;
    templeName: string;
    purohitName?: string;
    remarks?: string | null;
  }): Promise<void> {
    const statusBadge = 'Temple Approved';
    const userName = data.purohitName || 'Purohit';
    const preheaderText = `Congratulations! Your submitted temple "${data.templeName}" has been approved.`;
    const emailMessage = `Congratulations! Your temple submission for <strong>${this.escapeHtml(data.templeName)}</strong> has been verified and approved by the ${platformBrandName} administrative team. It is now active and listed on the ${platformBrandName} platform.`;

    const detailsRows: EmailTableRow[] = [
      { label: 'Temple Name', value: data.templeName },
      { label: 'Verification Status', value: 'Approved', isHighlight: true },
    ];
    if (data.remarks && data.remarks.trim()) {
      detailsRows.push({ label: 'Admin Remarks', value: data.remarks.trim() });
    }

    const html = renderPoojawalaEmail({
      statusBadge,
      userName,
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Temple Verification Summary',
        rows: detailsRows,
      },
      highlight:
        data.remarks && data.remarks.trim()
          ? {
              title: 'Verification Remarks',
              text: data.remarks.trim(),
            }
          : undefined,
    });

    await this.sendMail({
      to: data.email,
      subject: `Temple Submission Approved - ${data.templeName} | ${platformBrandName}`,
      html,
    });
  }

  async sendTempleRejectionEmail(data: {
    email: string;
    templeName: string;
    rejectionReason: string;
    purohitName?: string;
  }): Promise<void> {
    const statusBadge = 'Temple Submission Rejected';
    const userName = data.purohitName || 'Purohit';
    const preheaderText = `Update regarding your temple submission "${data.templeName}".`;
    const emailMessage = `Thank you for submitting <strong>${this.escapeHtml(data.templeName)}</strong> to ${platformBrandName}. After careful review by our administrative team, the temple submission could not be approved at this time.`;

    const detailsRows: EmailTableRow[] = [
      { label: 'Temple Name', value: data.templeName },
      { label: 'Verification Status', value: 'Rejected', isHighlight: true },
      { label: 'Rejection Reason', value: data.rejectionReason },
    ];

    const html = renderPoojawalaEmail({
      statusBadge,
      userName,
      preheaderText,
      emailMessage,
      detailsTable: {
        title: 'Temple Verification Summary',
        rows: detailsRows,
      },
      highlight: {
        title: 'Rejection Reason',
        text: data.rejectionReason,
      },
    });

    await this.sendMail({
      to: data.email,
      subject: `Temple Submission Update - ${data.templeName} | ${platformBrandName}`,
      html,
    });
  }
}

