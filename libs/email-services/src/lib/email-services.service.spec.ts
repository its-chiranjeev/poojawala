import { EmailService } from './email-services.service';
import { ResendProvider } from './providers/resend.provider';

describe('EmailService - Centralized Platform Branding', () => {
  let service: EmailService;
  let mockResendProvider: { sendMail: jest.Mock };

  beforeEach(() => {
    mockResendProvider = {
      sendMail: jest.fn().mockResolvedValue({ data: { id: 'test_mail_id' }, error: null }),
    };
    service = new EmailService(undefined, mockResendProvider as any);
  });

  it('should send OTP email with 1Pooja branding and subject', async () => {
    await service.sendOtpEmail('test@example.com', '123456', 'Devotee', 'Login Verification');

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Login Verification - 1Pooja',
        html: expect.stringContaining('123456'),
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('1Pooja');
    expect(sentHtml).not.toContain('poojawala.com');
  });

  it('should send Purohit approval email with 1Pooja branding in subject and body', async () => {
    await service.sendPurohitApprovalEmail('purohit@example.com', 'Acharya');

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'purohit@example.com',
        subject: 'Your Purohit Profile Has Been Approved - 1Pooja',
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('1Pooja');
    expect(sentHtml).not.toContain('poojawala.com');
  });

  it('should send Astrologer approval email with 1Pooja branding', async () => {
    await service.sendAstrologerApprovalEmail('astrologer@example.com', 'Panditji');

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'astrologer@example.com',
        subject: 'Your Astrologer Profile Has Been Approved - 1Pooja',
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('1Pooja');
    expect(sentHtml).not.toContain('poojawala.com');
  });

  it('should send Customer Welcome / Registration email with 1Pooja branding', async () => {
    await service.sendCustomerRegistrationEmail({
      email: 'customer@example.com',
      name: 'Rohan Sharma',
    });

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: 'Welcome to 1Pooja - Your Sacred Journey Begins',
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('1Pooja');
    expect(sentHtml).not.toContain('poojawala.com');
  });

  it('should send Booking confirmation email with 1Pooja branding', async () => {
    await service.sendCustomerBookingConfirmationEmail({
      email: 'customer@example.com',
      customerName: 'Rohan Sharma',
      bookingId: 'BK-999',
      serviceName: 'Satyanarayan Pooja',
      bookingDate: '2026-10-25',
      bookingTime: '10:00 AM',
      bookingAddress: 'Sector 62, Noida',
      purohitName: 'Pt. Sharma',
      totalAmount: 2500,
      amountPaid: 2500,
      pendingAmount: 0,
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
    });

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: 'Booking Confirmed - 1Pooja | Booking #BK-999',
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('1Pooja');
    expect(sentHtml).not.toContain('poojawala.com');
  });

  it('should send Booking Created email with pending payment instructions and 1Pooja branding', async () => {
    mockResendProvider.sendMail.mockClear();
    await service.sendCustomerBookingCreatedEmail({
      email: 'customer@example.com',
      customerName: 'Aarav Patel',
      bookingId: '1001',
      bookingNumber: 'PW-1001',
      serviceName: 'Ganesh Pooja',
      servicePlan: 'Standard',
      bookingDate: '2026-11-10',
      bookingTime: '09:00 AM',
      bookingAddress: 'Flat 402, Mumbai',
      totalAmount: 3100,
      payableAmount: 930,
      paymentType: 'TOKEN',
      paymentStatus: 'PENDING',
      bookingStatus: 'CREATED',
      paymentUrl: 'https://rzp.io/i/testpay',
    });

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: expect.stringContaining('Booking Registered - 1Pooja | Complete Payment for Booking PW-1001'),
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('Complete Payment Now');
    expect(sentHtml).toContain('https://rzp.io/i/testpay');
    expect(sentHtml).toContain('930');
    expect(sentHtml).toContain('Advance Token Payment');
  });

  it('should send Token Payment Confirmed email with remaining balance notice', async () => {
    mockResendProvider.sendMail.mockClear();
    await service.sendCustomerBookingTokenPaymentEmail({
      email: 'customer@example.com',
      customerName: 'Aarav Patel',
      bookingId: '1001',
      bookingNumber: 'PW-1001',
      serviceName: 'Ganesh Pooja',
      servicePlan: 'Standard',
      bookingDate: '2026-11-10',
      bookingTime: '09:00 AM',
      bookingAddress: 'Flat 402, Mumbai',
      totalAmount: 3100,
      amountPaid: 930,
      remainingAmount: 2170,
    });

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: expect.stringContaining('Advance Payment Confirmed - 1Pooja | Booking PW-1001'),
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('2170');
    expect(sentHtml).toContain('before the conclusion of your Puja ceremony');
    expect(sentHtml).toContain('Complete Payment Before Ceremony Completion');
  });

  it('should send Booking Payment Failed email with failure reason', async () => {
    mockResendProvider.sendMail.mockClear();
    await service.sendCustomerBookingPaymentFailedEmail({
      email: 'customer@example.com',
      customerName: 'Aarav Patel',
      bookingId: '1001',
      bookingNumber: 'PW-1001',
      serviceName: 'Ganesh Pooja',
      amount: 930,
      failureReason: 'Payment declined by bank due to insufficient funds',
      retryPaymentUrl: 'https://rzp.io/i/retrypay',
    });

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: expect.stringContaining('Payment Failed - 1Pooja | Booking PW-1001'),
      }),
    );
    const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
    expect(sentHtml).toContain('Payment declined by bank due to insufficient funds');
    expect(sentHtml).toContain('Retry Payment Now');
  });

  it('should send Booking cancellation email with 1Pooja branding', async () => {
    await service.sendBookingCancellationEmailToCustomer({
      email: 'customer@example.com',
      customerName: 'Rohan Sharma',
      bookingId: 'BK-999',
      serviceName: 'Satyanarayan Pooja',
      bookingDate: '2026-10-25',
      bookingTime: '10:00 AM',
      cancelledBy: 'CUSTOMER',
      cancellationReason: 'Change of schedule',
    });

    expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: 'Booking Cancelled - 1Pooja | Booking #BK-999',
      }),
    );
  });

  describe('sendContactUsReplyEmail - Service Queries with Online/Offline Badges', () => {
    it('should send service inquiry reply with Online badge when service isOnline is true', async () => {
      await service.sendContactUsReplyEmail({
        email: 'devotee@example.com',
        name: 'Aarav Patel',
        status: 'READ',
        adminMessage: 'Panditji will conduct the pooja online via video call.',
        subject: 'Is this pooja available online?',
        userOriginalMessage: 'Can I attend via Google Meet?',
        service: {
          id: 12,
          name: 'Maha Rudrabhishek Pooja',
          slug: 'maha-rudrabhishek-pooja',
          isOnline: true,
          isOffline: false,
        },
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'devotee@example.com',
          subject: 'Update on your inquiry for Maha Rudrabhishek Pooja [READ] - 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Maha Rudrabhishek Pooja');
      expect(sentHtml).toContain('Online Service Inquiry');
      expect(sentHtml).toContain('🌐 Online');
      expect(sentHtml).toContain('Inquired Service');
      expect(sentHtml).toContain('Explore Service Details');
      expect(sentHtml).toContain('Panditji will conduct the pooja online via video call.');
      expect(sentHtml).not.toContain('Service Name:');
      expect(sentHtml).not.toContain('Service Mode:');
    });

    it('should send service inquiry reply with Offline badge when service isOffline is true', async () => {
      await service.sendContactUsReplyEmail({
        email: 'devotee@example.com',
        name: 'Aarav Patel',
        status: 'READ',
        adminMessage: 'Purohitji will arrive at your home with samagri.',
        subject: 'Pooja at home?',
        userOriginalMessage: 'Can you send pandit to my home?',
        service: {
          id: 15,
          name: 'Griha Pravesh Pooja',
          slug: 'griha-pravesh-pooja',
          isOnline: false,
          isOffline: true,
        },
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'devotee@example.com',
          subject: 'Update on your inquiry for Griha Pravesh Pooja [READ] - 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Griha Pravesh Pooja');
      expect(sentHtml).toContain('Offline Service Inquiry');
      expect(sentHtml).toContain('🏛️ Offline');
      expect(sentHtml).toContain('Inquired Service');
    });

    it('should send both Online and Offline badges when service supports both', async () => {
      await service.sendContactUsReplyEmail({
        email: 'devotee@example.com',
        name: 'Devotee',
        status: 'READ',
        adminMessage: 'Both in-person and online video options are supported.',
        service: {
          id: 20,
          name: 'Satyanarayan Katha',
          slug: 'satyanarayan-katha',
          isOnline: true,
          isOffline: true,
        },
      });

      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('🌐 Online');
      expect(sentHtml).toContain('🏛️ Offline');
    });

    it('should fall back to standard inquiry email when no service details provided', async () => {
      await service.sendContactUsReplyEmail({
        email: 'general@example.com',
        name: 'Devotee',
        status: 'READ',
        adminMessage: 'Thank you for your general inquiry.',
        subject: 'General Question',
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'general@example.com',
          subject: 'Update on your contact inquiry [READ] - 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).not.toContain('Inquired Service');
      expect(sentHtml).not.toContain('🌐 Online');
      expect(sentHtml).not.toContain('🏛️ Offline');
      expect(sentHtml).not.toContain('Preferred Date &amp; Time');
      expect(sentHtml).not.toContain('Preferred Date & Time');
      expect(sentHtml).not.toContain('Address');
    });

    it('should render preferredDateTime and address in inquiry details table when provided', async () => {
      await service.sendContactUsReplyEmail({
        email: 'customer@example.com',
        name: 'Rahul Sharma',
        status: 'IN_PROGRESS',
        adminMessage: 'We have reserved your slot and Panditji will visit the location.',
        subject: 'Vastu Shanti Pooja',
        preferredDateTime: '2026-10-29T10:30:00+05:30',
        address: 'Flat 402, Shanti Niketan, Varanasi, UP - 221001',
      });

      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Rahul Sharma');
      expect(sentHtml).toContain('Preferred Date &amp; Time');
      expect(sentHtml).toContain('29 Oct 2026');
      expect(sentHtml).toContain('Address');
      expect(sentHtml).toContain('Flat 402, Shanti Niketan, Varanasi, UP - 221001');
      expect(sentHtml).toContain('We have reserved your slot and Panditji will visit the location.');
    });
  });

  describe('Temple Verification Emails', () => {
    it('should send Temple Submission/Registration confirmation email with pending approval badge and instructions', async () => {
      await service.sendTempleSubmittedEmail({
        email: 'purohit@example.com',
        templeName: 'Kashi Vishwanath Temple',
        purohitName: 'Pandit Ramesh',
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'purohit@example.com',
          subject: 'Temple Registered Successfully - Kashi Vishwanath Temple | 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Kashi Vishwanath Temple');
      expect(sentHtml).toContain('Temple Registered Successfully');
      expect(sentHtml).toContain('Pending Approval');
      expect(sentHtml).toContain('wait for the administration verification approval');
    });

    it('should send Temple Approval email without remarks section when remarks are omitted', async () => {
      await service.sendTempleApprovalEmail({
        email: 'purohit@example.com',
        templeName: 'Somnath Temple',
        purohitName: 'Acharya Shastri',
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'purohit@example.com',
          subject: 'Temple Submission Approved - Somnath Temple | 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Somnath Temple');
      expect(sentHtml).toContain('Temple Approved');
      expect(sentHtml).toContain('Approved');
      expect(sentHtml).not.toContain('Verification Remarks');
    });

    it('should send Temple Approval email with remarks section when remarks are provided', async () => {
      await service.sendTempleApprovalEmail({
        email: 'purohit@example.com',
        templeName: 'Somnath Temple',
        purohitName: 'Acharya Shastri',
        remarks: 'Physical documents verified and trust verified.',
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'purohit@example.com',
          subject: 'Temple Submission Approved - Somnath Temple | 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Somnath Temple');
      expect(sentHtml).toContain('Verification Remarks');
      expect(sentHtml).toContain('Physical documents verified and trust verified.');
    });

    it('should send Temple Rejection email with mandatory rejection reason and badge', async () => {
      await service.sendTempleRejectionEmail({
        email: 'purohit@example.com',
        templeName: 'Old Shiv Mandir',
        rejectionReason: 'Trust registration certificate is expired.',
        purohitName: 'Acharya Shastri',
      });

      expect(mockResendProvider.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'purohit@example.com',
          subject: 'Temple Submission Update - Old Shiv Mandir | 1Pooja',
        }),
      );
      const sentHtml = mockResendProvider.sendMail.mock.calls[0][0].html;
      expect(sentHtml).toContain('Old Shiv Mandir');
      expect(sentHtml).toContain('Temple Submission Rejected');
      expect(sentHtml).toContain('Rejected');
      expect(sentHtml).toContain('Rejection Reason');
      expect(sentHtml).toContain('Trust registration certificate is expired.');
    });
  });
});

