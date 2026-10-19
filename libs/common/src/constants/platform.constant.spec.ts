import {
  platformDomainName,
  platformBrandName,
  platformCompanyName,
  platformSupportEmail,
  platformVerifiedSenderDomain,
  getPlatformWebsiteUrl,
  getPlatformMailFrom,
} from './platform.constant';

describe('Centralized Platform Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should export the required platformDomainName as "1pooja"', () => {
    expect(platformDomainName).toBe('1pooja');
  });

  it('should export default platform brand and company values', () => {
    expect(platformBrandName).toBeDefined();
    expect(platformCompanyName).toBeDefined();
    expect(platformSupportEmail).toBeDefined();
    expect(platformVerifiedSenderDomain).toBe('send.1pooja.com');
  });

  it('should return normalized website URL without trailing slashes', () => {
    process.env['FRONTEND_URL'] = 'https://1pooja.com/';
    expect(getPlatformWebsiteUrl()).toBe('https://1pooja.com');

    process.env['FRONTEND_URL'] = 'https://custom-domain.org///';
    expect(getPlatformWebsiteUrl()).toBe('https://custom-domain.org');
  });

  it('should fallback getPlatformWebsiteUrl safely when FRONTEND_URL is missing', () => {
    delete process.env['FRONTEND_URL'];
    delete process.env['FRONTEND_PAYMENT_CALLBACK_URL'];
    expect(getPlatformWebsiteUrl()).toBe(`https://${platformDomainName}.com`);
  });

  it('should resolve getPlatformMailFrom with verified domain and guard against unverified poojawala.com', () => {
    // If MAIL_FROM contains unverified poojawala.com, it must discard it and use verified domain
    process.env['MAIL_FROM'] = 'POOJAWALA <info@poojawala.com>';
    const mailFrom = getPlatformMailFrom();
    expect(mailFrom).not.toContain('poojawala.com');
    expect(mailFrom).toContain('send.1pooja.com');

    // If MAIL_FROM is clean and verified, it should preserve it
    process.env['MAIL_FROM'] = '1Pooja <info@send.1pooja.com>';
    expect(getPlatformMailFrom()).toBe('1Pooja <info@send.1pooja.com>');

    // If MAIL_FROM is empty, fallback to verified domain
    delete process.env['MAIL_FROM'];
    expect(getPlatformMailFrom()).toContain('send.1pooja.com');
  });
});
