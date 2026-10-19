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
});
