export interface EmailTableRow {
  label: string;
  value: string;
  isHighlight?: boolean;
  /** When provided, the value cell is rendered as a clickable hyperlink */
  link?: string;
  /** Custom link text — defaults to value if not provided */
  linkText?: string;
}

export interface EmailDetailsTable {
  title: string;
  paymentStatus?: string;
  keepPaymentStatusInRows?: boolean;
  rows: EmailTableRow[];
  totalRow?: {
    label: string;
    value: string;
  };
}

export interface EmailHighlightBox {
  title: string;
  text: string;
}

export interface PoojawalaEmailTemplateOptions {
  preheaderText?: string;
  statusBadge: string;
  userName: string;
  emailMessage: string;
  otpCode?: string;
  otpSubtitle?: string;
  highlight?: EmailHighlightBox;
  detailsTable?: EmailDetailsTable;
  paymentStatus?: string;
  additionalContentHtml?: string;
  websiteUrl?: string;
}

function escapeHtml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface PaymentStatusBadgeConfig {
  bg: string;
  color: string;
  border: string;
  icon: string;
  text: string;
}

function getPaymentStatusBadge(status: string): PaymentStatusBadgeConfig {
  const clean = String(status || '').trim();
  const s = clean.toUpperCase();

  if (s === 'PAID' || s === 'SUCCESS' || s === 'COMPLETED' || s === 'SUCCESSFUL') {
    return {
      bg: '#E8F5E9',
      color: '#2E7D32',
      border: '#C8E6C9',
      icon: '✓',
      text: clean,
    };
  }

  if (s.includes('COD') || s === 'COD_PENDING' || s === 'COD PENDING') {
    return {
      bg: '#FFF3E0',
      color: '#D84315',
      border: '#FFCC80',
      icon: '⏳',
      text: clean,
    };
  }

  if (s === 'PENDING' || s.includes('PENDING')) {
    return {
      bg: '#FFF8E1',
      color: '#E65100',
      border: '#FFE082',
      icon: '⏳',
      text: clean,
    };
  }

  if (s === 'FAILED' || s.includes('FAIL') || s === 'CANCELLED' || s === 'CANCELED') {
    return {
      bg: '#FFEBEE',
      color: '#C62828',
      border: '#FFCDD2',
      icon: '✕',
      text: clean,
    };
  }

  if (s.includes('REFUND')) {
    return {
      bg: '#EDE7F6',
      color: '#512DA8',
      border: '#D1C4E9',
      icon: '↺',
      text: clean,
    };
  }

  return {
    bg: '#FFF2EB',
    color: '#D32F2F',
    border: '#FFE0D0',
    icon: '●',
    text: clean,
  };
}

export function renderPoojawalaEmail(options: PoojawalaEmailTemplateOptions): string {
  const websiteUrl = options.websiteUrl || process.env['FRONTEND_URL'] || 'https://poojawala.com';
  const preheaderText = escapeHtml(options.preheaderText || options.statusBadge);
  const statusBadge = escapeHtml(options.statusBadge);
  const userName = escapeHtml(options.userName || 'Devotee');
  const emailMessage = options.emailMessage; // May contain safe formatting

  // Optional OTP Block
  let otpBlock = '';
  if (options.otpCode) {
    const otpCode = escapeHtml(options.otpCode);
    const otpSubtitle = escapeHtml(options.otpSubtitle || 'Valid for 10 minutes. Do not share this code with anyone.');
    otpBlock = `
      <!-- MODULAR CONTENT BLOCK 1: OTP VERIFICATION BOX -->
      <tr>
        <td align="center" style="padding: 0 40px 28px 40px;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color: #FFF6EE; border: 2px dashed #FF6200; border-radius: 16px; padding: 20px 30px; text-align: center; width: 100%; max-width: 440px;">
            <tr>
              <td align="center">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #8C6A5A; text-transform: uppercase; letter-spacing: 1.5px;">Your One-Time Password (OTP)</p>
                <div style="font-size: 34px; font-weight: 800; color: #D32F2F; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace; margin: 8px 0;">
                  ${otpCode}
                </div>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #888888;">${otpSubtitle}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Optional Highlight / Callout Box
  let highlightBlock = '';
  if (options.highlight) {
    const rawTitle = options.highlight.title;
    const title = escapeHtml(rawTitle);
    const rawText = options.highlight.text;
    const formattedText = escapeHtml(rawText).replace(/\n/g, '<br>');
    const isResponse = rawTitle.toLowerCase().includes('response') || rawTitle.toLowerCase().includes('reply');

    highlightBlock = `
      <!-- MODULAR CONTENT BLOCK 2: INTERACTIVE HIGHLIGHT / RESPONSE CARD -->
      <tr>
        <td style="padding: 0 40px 24px 40px;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFFFF; border: 1.5px solid #FFDFC7; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(255, 98, 0, 0.06);">
            <!-- Header bar of card -->
            <tr>
              <td style="background-color: #FFF2EB; padding: 13px 20px; border-bottom: 1px solid #FFE0D0;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="vertical-align: middle;">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width: 26px; height: 26px; background: linear-gradient(135deg, #FF6200 0%, #D32F2F 100%); border-radius: 50%; text-align: center; vertical-align: middle;">
                            <span style="font-size: 13px; line-height: 26px; display: block;">${isResponse ? '🪔' : '📌'}</span>
                          </td>
                          <td style="padding-left: 10px; vertical-align: middle;">
                            <h3 style="margin: 0; font-size: 14.5px; font-weight: 700; color: #D32F2F; font-family: 'Outfit', -apple-system, sans-serif;">
                              ${title}
                            </h3>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" style="vertical-align: middle;">
                      <span style="display: inline-block; background-color: #E8F5E9; color: #2E7D32; font-size: 10.5px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1px solid #C8E6C9; white-space: nowrap;">
                        ✓ Official
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Card Content -->
            <tr>
              <td style="padding: 20px 22px; background: linear-gradient(180deg, #FFFFFF 0%, #FFFDF9 100%);">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="vertical-align: top; width: 22px; padding-right: 8px;">
                      <span style="font-size: 26px; line-height: 1; color: #FFA366; font-family: Georgia, serif; display: block;">“</span>
                    </td>
                    <td style="vertical-align: top;">
                      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #2C2420; font-weight: 500;">
                        ${formattedText}
                      </p>
                    </td>
                  </tr>
                </table>

                ${
                  isResponse
                    ? `
                  <!-- Sign-off inside card -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #FFE2CE;">
                    <tr>
                      <td style="vertical-align: middle;">
                        <span style="font-size: 11.5px; color: #A67D65; font-style: italic;">
                          — Poojawala Devotee Care Desk
                        </span>
                      </td>
                    </tr>
                  </table>
                `
                    : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // Optional Details Table Card
  let detailsTableBlock = '';
  if (options.detailsTable && options.detailsTable.rows?.length > 0) {
    const tableTitle = escapeHtml(options.detailsTable.title);

    const isPaymentStatusLabel = (label: string | undefined | null) =>
      label != null && label.trim().toLowerCase().replace(/:$/, '') === 'payment status';

    const paymentStatusRow = options.detailsTable.rows.find((r) => isPaymentStatusLabel(r.label));

    const rawPaymentStatus =
      options.detailsTable.paymentStatus ||
      options.paymentStatus ||
      (paymentStatusRow ? paymentStatusRow.value : undefined);

    const paymentBadge = rawPaymentStatus ? getPaymentStatusBadge(rawPaymentStatus) : null;

    const displayRows =
      paymentBadge && !options.detailsTable.keepPaymentStatusInRows
        ? options.detailsTable.rows.filter((r) => !isPaymentStatusLabel(r.label))
        : options.detailsTable.rows;

    const rowsHtml = displayRows
      .map((row) => {
        const valColor = row.isHighlight ? '#FF6200' : '#1A1A1A';
        const valWeight = row.isHighlight ? '700' : '600';
        const cellContent = row.link
          ? `<a href="${row.link}" target="_blank" rel="noopener noreferrer" style="color: #FF6200; font-weight: 700; text-decoration: underline; word-break: break-all;">${escapeHtml(row.linkText || row.value)}</a>`
          : escapeHtml(row.value);
        const cleanLabel = row.label ? row.label.trim().toLowerCase().replace(/:$/, '') : '';
        const isOrderContext =
          options.detailsTable?.title?.toLowerCase().includes('order') ||
          options.statusBadge?.toLowerCase().includes('order') ||
          options.preheaderText?.toLowerCase().includes('order');

        let labelText = row.label;
        if (cleanLabel === 'order number') {
          labelText = 'Order ID';
        } else if (cleanLabel === 'total amount' && isOrderContext) {
          labelText = 'Customer Paid Amount';
        }

        return `
          <tr>
            <td style="padding: 12px 20px; font-size: 14px; color: #777777; border-bottom: 1px dashed #FFEADB; width: 42%; vertical-align: top;">
              ${escapeHtml(labelText)}:
            </td>
            <td style="padding: 12px 20px; font-size: 14px; font-weight: ${valWeight}; color: ${valColor}; border-bottom: 1px dashed #FFEADB; text-align: right; vertical-align: top;">
              ${cellContent}
            </td>
          </tr>
        `;
      })
      .join('');

    let totalRowHtml = '';
    if (options.detailsTable.totalRow) {
      const cleanTotalLabel = options.detailsTable.totalRow.label
        ? options.detailsTable.totalRow.label.trim().toLowerCase().replace(/:$/, '')
        : '';
      const isOrderContext =
        options.detailsTable?.title?.toLowerCase().includes('order') ||
        options.statusBadge?.toLowerCase().includes('order') ||
        options.preheaderText?.toLowerCase().includes('order');

      const totalLabel =
        cleanTotalLabel === 'total amount' && isOrderContext
          ? 'Customer Paid Amount'
          : options.detailsTable.totalRow.label;

      totalRowHtml = `
        <tr>
          <td style="padding: 14px 20px; font-size: 15px; font-weight: 700; color: #1A1A1A; background-color: #FFFBF7;">
            ${escapeHtml(totalLabel)}
          </td>
          <td style="padding: 14px 20px; font-size: 18px; font-weight: 800; color: #D32F2F; background-color: #FFFBF7; text-align: right;">
            ${escapeHtml(options.detailsTable.totalRow.value)}
          </td>
        </tr>
      `;
    }

    detailsTableBlock = `
      <!-- MODULAR CONTENT BLOCK 3: DETAILS TABLE CARD -->
      <tr>
        <td style="padding: 0 40px 28px 40px;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFFFF; border: 1px solid #FFE0D0; border-radius: 16px; overflow: hidden;">
            <tr>
              <td colspan="2" style="background-color: #FFF2EB; padding: 12px 20px; border-bottom: 1px solid #FFE0D0;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="vertical-align: middle;">
                      <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #D32F2F; font-family: 'Outfit', -apple-system, sans-serif;">
                        🪔 ${tableTitle}
                      </h3>
                    </td>
                    ${
                      paymentBadge
                        ? `
                    <td align="right" style="vertical-align: middle;">
                      <span style="display: inline-block; background-color: ${paymentBadge.bg}; color: ${paymentBadge.color}; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; border: 1px solid ${paymentBadge.border}; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ${paymentBadge.icon} ${escapeHtml(paymentBadge.text)}
                      </span>
                    </td>
                    `
                        : ''
                    }
                  </tr>
                </table>
              </td>
            </tr>
            ${rowsHtml}
            ${totalRowHtml}
          </table>
        </td>
      </tr>
    `;
  }

  // Additional custom HTML block if provided
  let additionalHtml = '';
  if (options.additionalContentHtml) {
    additionalHtml = `
      <tr>
        <td style="padding: 0 40px 24px 40px;" class="mobile-padding">
          ${options.additionalContentHtml}
        </td>
      </tr>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Poojawala - Sacred Pooja Services</title>
  
  <!--[if mso]>
  <style type="text/css">
    table, td, div, p, a, h1, h2, h3 { font-family: 'Segoe UI', Arial, sans-serif !important; }
  </style>
  <![endif]-->
  
  <style type="text/css">
    /* Global Reset */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
      width: 100% !important;
      background-color: #FFF9F4;
      font-family: 'Outfit', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    * {
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
    }
    div[style*="margin: 16px 0"] {
      margin: 0 !important;
    }
    table, td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      border-collapse: collapse !important;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    a {
      text-decoration: none;
    }
    
    /* Responsive Styles */
    @media screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        margin: auto !important;
      }
      .stack-column {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        direction: ltr !important;
        margin-bottom: 15px !important;
      }
      .mobile-padding {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .mobile-center {
        text-align: center !important;
      }
      .cta-button {
        display: block !important;
        width: 85% !important;
        text-align: center !important;
      }
      .otp-digit {
        font-size: 24px !important;
        padding: 8px 12px !important;
      }
    }
  </style>
</head>

<body width="100%" style="margin: 0; padding: 0; background-color: #FFF9F4;">
  <center style="width: 100%; background-color: #FFF9F4; padding: 30px 0 40px 0;">
    
    <!-- Preheader Text (Hidden preview text for inbox) -->
    <div style="display: none; font-size: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
      ${preheaderText}
    </div>

    <!-- Main Container -->
    <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="margin: auto; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 36px rgba(255, 98, 0, 0.08); border: 1px solid #FFE5D4;">
      
      <!-- Top Decorative Banner / Gradient Bar -->
      <tr>
        <td style="background: linear-gradient(90deg, #FF6200 0%, #D32F2F 50%, #FF6200 100%); height: 6px; font-size: 0; line-height: 0;">
          &nbsp;
        </td>
      </tr>

      <!-- Header Section -->
      <tr>
        <td style="padding: 28px 40px 24px 40px; background-color: #FFFFFF; text-align: center; border-bottom: 1px solid #FFF0E6;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center">
                <!-- Brand Title / Logo Text -->
                <h1 style="margin: 0; font-size: 32px; font-weight: 800; color: #D32F2F; letter-spacing: -0.5px; font-family: 'Outfit', 'DM Sans', sans-serif;">
                  Poojawala<span style="color: #FF6200;">.</span>
                </h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; font-weight: 600; color: #8C6A5A; text-transform: uppercase; letter-spacing: 1.5px;">
                  Your Sacred pooja Partner
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Hero Greeting Banner -->
      <tr>
        <td style="padding: 36px 40px 24px 40px; background: linear-gradient(180deg, #FFF6EE 0%, #FFFFFF 100%);" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <!-- Dynamic Status Badge -->
            <tr>
              <td align="center" style="padding-bottom: 16px;">
                <span style="display: inline-block; background-color: #FFEADB; color: #FF6200; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 6px 16px; border-radius: 50px; border: 1px solid #FFD3B5;">
                  ${statusBadge}
                </span>
              </td>
            </tr>
            
            <!-- TODO: Namaste greeting commented out
            <tr>
              <td align="center" style="padding-bottom: 12px;">
                <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1A1A1A; line-height: 1.3;">
                  Namaste, <span style="color: #FF6200;">${userName}</span> Ji! 🙏
                </h2>
              </td>
            </tr>
            -->

            <!-- Main Message Text -->
            <tr>
              <td align="center">
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555; max-width: 480px;">
                  ${emailMessage}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ${otpBlock}
      ${highlightBlock}
      ${detailsTableBlock}
      ${additionalHtml}

      <!-- Divider -->
      <tr>
        <td style="padding: 0 40px;" class="mobile-padding">
          <hr style="border: 0; border-top: 1px solid #FFF0E6; margin: 0;">
        </td>
      </tr>

      <!-- Why Poojawala / 3 Columns Highlights -->
      <tr>
        <td style="padding: 28px 40px;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <!-- Column 1 -->
              <td width="33.33%" class="stack-column" align="center" style="vertical-align: top; padding: 10px;">
                <div style="font-size: 28px; margin-bottom: 8px;">🕉️</div>
                <div style="font-size: 13.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 4px;">Verified Purohits</div>
                <div style="font-size: 12px; color: #777777; line-height: 1.4;">Experienced Vedic Pandits for all rituals</div>
              </td>
              <!-- Column 2 -->
              <td width="33.33%" class="stack-column" align="center" style="vertical-align: top; padding: 10px;">
                <div style="font-size: 28px; margin-bottom: 8px;">🌸</div>
                <div style="font-size: 13.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 4px;">Pure Samagri</div>
                <div style="font-size: 12px; color: #777777; line-height: 1.4;">100% authentic, handpicked pooja items</div>
              </td>
              <!-- Column 3 -->
              <td width="33.33%" class="stack-column" align="center" style="vertical-align: top; padding: 10px;">
                <div style="font-size: 28px; margin-bottom: 8px;">📿</div>
                <div style="font-size: 13.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 4px;">Hassle Free</div>
                <div style="font-size: 12px; color: #777777; line-height: 1.4;">On-time sacred service guaranteed</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Need Help / Support Callout -->
      <tr>
        <td style="padding: 0 40px 32px 40px;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFF6EE; border-radius: 14px; text-align: center;">
            <tr>
              <td style="padding: 16px 20px;">
                <p style="margin: 0; font-size: 13.5px; color: #666666;">
                  Have questions or need assistance? We're here for you. <br>
                  Email us at <a href="mailto:support@poojawala.com" style="color: #FF6200; font-weight: 700; text-decoration: underline;">support@poojawala.com</a> or call <strong style="color: #1A1A1A;">+91 98765 43210</strong>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer Section -->
      <tr>
        <td style="background-color: #26120B; padding: 32px 40px; text-align: center;" class="mobile-padding">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <!-- Footer Brand -->
            <tr>
              <td align="center" style="padding-bottom: 12px;">
                <span style="font-size: 22px; font-weight: 800; color: #FFF; letter-spacing: -0.5px;">
                  Poojawala<span style="color: #FF6200;">.</span>
                </span>
              </td>
            </tr>

            <!-- Footer Tagline -->
            <tr>
              <td align="center" style="padding-bottom: 20px;">
                <p style="margin: 0; font-size: 13px; color: #D6C2B8; max-width: 400px; line-height: 1.5;">
                  Bringing tradition, devotion, and sacred Vedic pandits straight to your doorstep.
                </p>
              </td>
            </tr>

            <!-- TODO: Social Media Icons / Links commented out
            <tr>
              <td align="center" style="padding-bottom: 20px;">
                <a href="https://facebook.com" target="_blank" style="margin: 0 8px; color: #FF6200; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; background: rgba(255, 98, 0, 0.15); width: 34px; height: 34px; line-height: 34px; border-radius: 50%;">FB</a>
                <a href="https://instagram.com" target="_blank" style="margin: 0 8px; color: #FF6200; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; background: rgba(255, 98, 0, 0.15); width: 34px; height: 34px; line-height: 34px; border-radius: 50%;">IG</a>
                <a href="https://twitter.com" target="_blank" style="margin: 0 8px; color: #FF6200; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; background: rgba(255, 98, 0, 0.15); width: 34px; height: 34px; line-height: 34px; border-radius: 50%;">X</a>
                <a href="https://youtube.com" target="_blank" style="margin: 0 8px; color: #FF6200; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; background: rgba(255, 98, 0, 0.15); width: 34px; height: 34px; line-height: 34px; border-radius: 50%;">YT</a>
              </td>
            </tr>
            -->

            <!-- Navigation Links -->
            <tr>
              <td align="center" style="padding-bottom: 16px;">
                <a href="${websiteUrl}/privacy-policy" style="color: #ECC7B5; font-size: 12px; text-decoration: underline; margin: 0 10px;">Privacy Policy</a>
                <span style="color: #664436;">•</span>
                <a href="${websiteUrl}/terms-and-conditions" style="color: #ECC7B5; font-size: 12px; text-decoration: underline; margin: 0 10px;">Terms of Service</a>
                <span style="color: #664436;">•</span>
                <a href="${websiteUrl}" style="color: #ECC7B5; font-size: 12px; text-decoration: underline; margin: 0 10px;">Visit Website</a>
              </td>
            </tr>

            <!-- Copyright -->
            <tr>
              <td align="center">
                <p style="margin: 0; font-size: 11.5px; color: #9E7F72; line-height: 1.4;">
                  &copy; 2026 Poojawala Tech Services Pvt Ltd. All rights reserved. <br>
                  India &bull; Connecting Devotees Worldwide
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
    <!-- End Main Container -->

  </center>
</body>
</html>`;
}
