export interface MissingFieldGuidance {
  label: string;
  guidance: string;
}

export function mapMissingFieldToGuidance(
  field: string,
  role: 'PUROHIT' | 'ASTROLOGER',
): MissingFieldGuidance | null {
  const clean = String(field || '').trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();

  // Astrologers never require or show service areas
  if (role === 'ASTROLOGER' && (lower.includes('service area') || lower === 'servicearea')) {
    return null;
  }

  if (lower === 'qualification' || lower === 'education') {
    return {
      label: 'Qualification',
      guidance:
        role === 'ASTROLOGER'
          ? 'Please add your astrology-related educational or professional qualification.'
          : 'Please add your educational or professional qualification.',
    };
  }

  if (lower === 'city') {
    return {
      label: 'City',
      guidance: 'Please provide your current city.',
    };
  }

  if (lower === 'state') {
    return {
      label: 'State',
      guidance: 'Please provide your state.',
    };
  }

  if (lower === 'bio') {
    return {
      label: 'Bio',
      guidance: 'Please add a short professional introduction.',
    };
  }

  if (
    lower === 'aadhaar or pan document' ||
    lower.includes('aadhaar') ||
    lower.includes('pan document') ||
    lower.includes('identity document') ||
    lower === 'identitydocument'
  ) {
    return {
      label: 'Identity document',
      guidance: 'Please upload your Aadhaar or PAN document.',
    };
  }

  if (
    lower === 'bank account or upi id' ||
    lower === 'bank account or upi' ||
    lower === 'bankaccountorupi' ||
    lower.includes('bank account') ||
    lower.includes('upi')
  ) {
    return {
      label: 'Bank account or UPI',
      guidance: 'Please add valid bank account details or a UPI ID.',
    };
  }

  if (
    lower === 'at least one valid service area' ||
    lower === 'service area' ||
    lower === 'servicearea' ||
    lower.includes('service area')
  ) {
    return {
      label: 'Service area',
      guidance: 'Please add at least one valid service area.',
    };
  }

  if (lower === 'first name' || lower === 'firstname') {
    return {
      label: 'First name',
      guidance: 'Please provide your first name.',
    };
  }

  if (lower === 'email or phone number' || lower.includes('email') || lower.includes('phone')) {
    return {
      label: 'Contact details',
      guidance: 'Please provide a valid email address or phone number.',
    };
  }

  // Safe readable fallback for any unexpected identifier
  const humanized = clean
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    label: humanized,
    guidance: `Please provide your ${clean.replace(/[_-]/g, ' ').toLowerCase()}.`,
  };
}

export function renderMissingFieldsHtml(
  role: 'PUROHIT' | 'ASTROLOGER',
  missingFields?: string[],
): string {
  if (!missingFields || missingFields.length === 0) {
    return '';
  }

  const roleTitle = role === 'PUROHIT' ? 'Purohit' : 'Astrologer';
  const items: MissingFieldGuidance[] = [];
  const seenLabels = new Set<string>();

  for (const field of missingFields) {
    const item = mapMissingFieldToGuidance(field, role);
    if (item && !seenLabels.has(item.label.toLowerCase())) {
      seenLabels.add(item.label.toLowerCase());
      items.push(item);
    }
  }

  if (items.length === 0) {
    return '';
  }

  const listItemsHtml = items
    .map(
      (item) => `
      <li style="margin-bottom: 8px; font-size: 14px; line-height: 1.5; color: #333333;">
        <strong style="color: #1A1A1A;">${item.label}:</strong> ${item.guidance}
      </li>
    `,
    )
    .join('');

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFDF9; border: 1px solid #FFE0D0; border-left: 4px solid #FF6200; border-radius: 12px; margin-top: 16px;">
      <tr>
        <td style="padding: 20px 24px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #8A2B0E;">
            Complete Your ${roleTitle} Profile
          </h3>
          <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #555555;">
            Your account has been created successfully. However, some required information is still missing. Please update the following details so our administration team can review your profile and approve your account.
          </p>
          <div style="font-size: 14px; font-weight: 700; color: #1A1A1A; margin-bottom: 8px;">
            Details requiring attention:
          </div>
          <ul style="margin: 0; padding-left: 20px;">
            ${listItemsHtml}
          </ul>
        </td>
      </tr>
    </table>
  `;
}

