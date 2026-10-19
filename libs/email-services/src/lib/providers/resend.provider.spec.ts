import { ResendProvider } from './resend.provider';

jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => {
      return {
        emails: {
          send: jest.fn(),
        },
      };
    }),
  };
});

describe('ResendProvider', () => {
  let provider: ResendProvider;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['RESEND_API_KEY'] = 're_test_1234567890';
    process.env['MAIL_FROM'] = '1Pooja <info@send.1pooja.com>';
    provider = new ResendProvider();
    mockSend = (provider as any).resend.emails.send;
  });

  it('should send email using verified sender address from centralized config', async () => {
    mockSend.mockResolvedValue({
      data: { id: 'msg_test_123' },
      error: null,
    });

    const result = await provider.sendMail({
      to: 'devotee@example.com',
      subject: 'Your OTP Code',
      html: '<p>Your OTP is 123456</p>',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '1Pooja <info@send.1pooja.com>',
        to: 'devotee@example.com',
        subject: 'Your OTP Code',
      }),
    );
    expect(result.data?.id).toBe('msg_test_123');
  });

  it('should guard against unverified domain and fall back to verified sender domain', async () => {
    process.env['MAIL_FROM'] = 'POOJAWALA <info@poojawala.com>';
    mockSend.mockResolvedValue({
      data: { id: 'msg_test_456' },
      error: null,
    });

    await provider.sendMail({
      to: 'devotee@example.com',
      subject: 'Test Subject',
      html: '<p>Content</p>',
    });

    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.from).not.toContain('poojawala.com');
    expect(callArgs.from).toContain('send.1pooja.com');
  });

  it('should handle Resend 403 / unverified domain error, log safe diagnostics, and throw without exposing OTP', async () => {
    const errorResponse = {
      data: null,
      error: {
        message: 'The poojawala.com domain is not verified.',
        name: 'validation_error',
      },
    };
    mockSend.mockResolvedValue(errorResponse);

    const loggerErrorSpy = jest.spyOn((provider as any).logger, 'error');

    await expect(
      provider.sendMail({
        to: 'user@example.com',
        subject: 'Secret OTP Verification',
        html: '<p>SECRET_OTP_987654</p>',
      }),
    ).rejects.toThrow('The poojawala.com domain is not verified.');

    // Ensure logger was called with diagnostic info
    expect(loggerErrorSpy).toHaveBeenCalled();
    const loggedMessages = loggerErrorSpy.mock.calls.map((c) => c[0]).join(' ');
    expect(loggedMessages).toContain('user@example.com');
    expect(loggedMessages).toContain('The poojawala.com domain is not verified.');

    // CRITICAL: Sensitive OTP / HTML must NEVER be in logged messages
    expect(loggedMessages).not.toContain('SECRET_OTP_987654');
  });

  it('should propagate thrown errors without reporting false success', async () => {
    mockSend.mockRejectedValue(new Error('Network connection timeout'));

    await expect(
      provider.sendMail('user@example.com', 'Subject', '<p>Test</p>'),
    ).rejects.toThrow('Network connection timeout');
  });
});
