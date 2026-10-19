/**
 * Centralized Platform Configuration
 *
 * Defines platform domain, branding, support information, website URL, and email defaults.
 */

/**
 * The primary platform brand/domain identifier.
 * Required variable: platformDomainName = '1pooja'
 */
export const platformDomainName =
  process.env['PLATFORM_DOMAIN_NAME']?.trim() || '1pooja';

/**
 * Platform brand display name for emails, messages, and titles.
 */
export const platformBrandName =
  process.env['PLATFORM_BRAND_NAME']?.trim() ||
  process.env['POOJAWALA_COMPANY_NAME']?.trim() ||
  '1Pooja';

/**
 * Registered legal entity name for copyright and legal notices.
 */
export const platformCompanyName =
  process.env['PLATFORM_COMPANY_NAME']?.trim() ||
  process.env['POOJAWALA_COMPANY_NAME']?.trim() ||
  '1Pooja Tech Services Pvt Ltd';

/**
 * Official customer support email address.
 */
export const platformSupportEmail =
  process.env['SUPPORT_EMAIL']?.trim() ||
  process.env['POOJAWALA_COMPANY_EMAIL']?.trim() ||
  'support@1pooja.com';

/**
 * Official customer support contact number.
 */
export const platformSupportPhone =
  process.env['SUPPORT_PHONE']?.trim() ||
  process.env['POOJAWALA_COMPANY_PHONE']?.trim() ||
  '+91 98765 43210';

/**
 * Technical domain verified in Resend for sending outgoing emails.
 * Verified Resend domain: 'send.1pooja.com'.
 */
export const platformVerifiedSenderDomain =
  process.env['RESEND_VERIFIED_DOMAIN']?.trim() || 'send.1pooja.com';

/**
 * Canonical platform logo URL hosted on Vercel Blob storage.
 */
export const platformDefaultLogoUrl =
  process.env['PLATFORM_LOGO_URL']?.trim() ||
  'https://wv9qiathcc2z56f9.public.blob.vercel-storage.com/platform/1pooja-logo.png';

/**
 * Helper to retrieve normalized platform logo URL.
 */
export function getPlatformLogoUrl(): string {
  return process.env['PLATFORM_LOGO_URL']?.trim() || platformDefaultLogoUrl;
}

/**
 * Helper to retrieve normalized platform website URL.
 * Guarantees valid URL protocol and no trailing slash.
 */
export function getPlatformWebsiteUrl(): string {
  const envUrl =
    process.env['FRONTEND_URL']?.trim() ||
    process.env['FRONTEND_PAYMENT_CALLBACK_URL']?.trim() ||
    `https://${platformDomainName}.com`;
  return envUrl.replace(/\/+$/, '');
}

/**
 * Helper to resolve the configured sender email address.
 * Prioritizes explicit MAIL_FROM if configured and valid, otherwise uses the verified domain.
 * Guards against legacy unverified 'poojawala.com' to prevent Resend HTTP 403 errors.
 */
export function getPlatformMailFrom(): string {
  const mailFrom = process.env['MAIL_FROM']?.trim();
  if (mailFrom && mailFrom.length > 0 && !mailFrom.toLowerCase().includes('poojawala.com')) {
    return mailFrom;
  }
  return `${platformBrandName} <info@${platformVerifiedSenderDomain}>`;
}
