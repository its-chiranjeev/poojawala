import * as crypto from 'crypto';

export const DEFAULT_OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const MAX_OTP_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60; // 1 minute

/**
 * Generates a cryptographically secure random numeric OTP of the specified length.
 * Defaults to 6 digits (100000 - 999999).
 */
export function generateSecureOtp(length = 6): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
}

/**
 * Computes a secure SHA-256 hash of the OTP for storage.
 */
export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

/**
 * Securely verifies a submitted OTP against the stored hash.
 * Uses timing-safe constant-time comparison to prevent timing attacks.
 * Backward compatible: if the stored value is an unhashed plaintext OTP (length <= 10),
 * it safely compares plaintext values in constant time.
 */
export function verifyOtpHash(submittedOtp: string, storedValue: string): boolean {
  if (!submittedOtp || !storedValue) {
    return false;
  }

  const cleanSubmitted = submittedOtp.trim();
  const cleanStored = storedValue.trim();

  // If stored value is a 64-char SHA-256 hex string
  if (cleanStored.length === 64 && /^[0-9a-f]{64}$/i.test(cleanStored)) {
    const computedHash = hashOtp(cleanSubmitted);
    const bufA = Buffer.from(computedHash, 'utf8');
    const bufB = Buffer.from(cleanStored, 'utf8');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  // Backward compatibility fallback for legacy plaintext stored OTP
  const bufA = Buffer.from(cleanSubmitted, 'utf8');
  const bufB = Buffer.from(cleanStored, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}
