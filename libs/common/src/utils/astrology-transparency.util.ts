export interface AstrologyTransparencyData {
  platformAccessFee: number;
  ratePerMinute: number | null;
  isUnlocked: boolean;
  consultationChargesNoticeTitle: string;
  consultationFeeNotice: string;
  consultationDirectBillingNotice: string | null;
  activeNotice: string;
}

/**
 * Builds clear, professional, and consistent transparency messaging
 * that distinguishes Poojawala's platform access fee from direct astrologer
 * consultation charges.
 */
export function buildAstrologyTransparencyNotices(
  platformAccessFee: number,
  ratePerMinute?: number | string | null,
  isUnlocked = false,
): AstrologyTransparencyData {
  const numericRate =
    ratePerMinute != null && !isNaN(Number(ratePerMinute)) && Number(ratePerMinute) > 0
      ? Number(Number(ratePerMinute).toFixed(2))
      : null;

  const fee = Number((Number(platformAccessFee) || 0).toFixed(2));

  const paymentNoticeTitle = 'Astrology Consultation Charges';
  const paymentNoticeMessage =
    numericRate != null
      ? `Pay ₹${fee} to unlock the astrologer's details. This fee covers platform access only. Consultation charges are separate and payable directly to the astrologer at their applicable rate of ₹${numericRate}/min.`
      : `Pay ₹${fee} to unlock the astrologer's details. This fee covers platform access only. Consultation charges are separate and payable directly to the astrologer at their applicable per-minute rate. Please confirm the rate with the astrologer before starting.`;

  const unlockedNoticeTitle = 'Direct Astrologer Billing';
  const unlockedNoticeMessage =
    numericRate != null
      ? `Consultation charges (₹${numericRate}/min) are separate from the Poojawala platform access fee. Please confirm the applicable per-minute rate with the astrologer before starting your consultation. Payment for the consultation is made directly to the astrologer, not through Poojawala.`
      : `Consultation charges are separate from the Poojawala platform access fee. Please confirm the applicable per-minute rate with the astrologer before starting your consultation. Payment for the consultation is made directly to the astrologer, not through Poojawala.`;

  return {
    platformAccessFee: fee,
    ratePerMinute: numericRate,
    isUnlocked,
    consultationChargesNoticeTitle: isUnlocked ? unlockedNoticeTitle : paymentNoticeTitle,
    consultationFeeNotice: paymentNoticeMessage,
    consultationDirectBillingNotice: isUnlocked ? unlockedNoticeMessage : null,
    activeNotice: isUnlocked ? unlockedNoticeMessage : paymentNoticeMessage,
  };
}
