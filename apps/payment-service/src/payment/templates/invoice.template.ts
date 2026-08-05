export interface PaymentInvoiceTemplateData {
  invoiceTitle: string;
  invoiceId: string;
  dateLabel: string;

  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  companyGstin: string;

  customerName: string;
  customerEmail: string;
  customerPhone: string;
  billingAddress: string;

  bookingId: number;
  bookingNumber: string;
  bookingStatus: string;
  serviceName: string;
  purohitName: string;

  paymentId: string;
  orderId: string;
  paymentStatus: string;
  paymentMethod: string;
  statusClass: string;
  errorMessage: string;

  currency: string;
  amount: string;
  finalAmount: string;
  donationAmount: string;
  discountAmount: string;

  date: string;

  /*
   * Optional fields. Existing PaymentService calls will
   * continue to work without providing them.
   */
  couponCode?: string;
  scheduledAt?: string;
  websiteUrl?: string;
  supportHours?: string;
  logoUrl?: string;
}

const escapeHtml = (value: string | number | null | undefined): string => {
  return String(value ?? '-')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const displayValue = (value: string | number | null | undefined): string => {
  const normalizedValue = String(value ?? '').trim();

  return normalizedValue ? escapeHtml(normalizedValue) : '-';
};

const normalizeStatusClass = (statusClass: string): string => {
  const normalized = statusClass.trim().toLowerCase();

  if (['success', 'failed', 'pending', 'refunded'].includes(normalized)) {
    return normalized;
  }

  return 'pending';
};

const formatBookingStatus = (
  bookingStatus: string,
): {
  label: string;
  className: string;
} => {
  const normalized = bookingStatus.trim().toUpperCase();

  switch (normalized) {
    case 'COMPLETED':
      return {
        label: 'Completed',
        className: 'success',
      };

    case 'CANCELLED':
      return {
        label: 'Cancelled',
        className: 'failed',
      };

    case 'ONGOING':
      return {
        label: 'Ongoing',
        className: 'info',
      };

    case 'ARRIVED':
      return {
        label: 'Arrived',
        className: 'info',
      };

    case 'ENROUTE':
      return {
        label: 'En route',
        className: 'pending',
      };

    case 'ACCEPTED':
      return {
        label: 'Accepted',
        className: 'success',
      };

    default:
      return {
        label: normalized || 'Pending',
        className: 'pending',
      };
  }
};

export const paymentInvoiceTemplate = (
  data: PaymentInvoiceTemplateData,
): string => {
  const isProformaInvoice = data.invoiceTitle
    .toLowerCase()
    .includes('proforma');

  const hasError =
    Boolean(data.errorMessage) && data.errorMessage.trim() !== '-';

  const finalAmount = Number(data.finalAmount) || 0;

  const paidAmount = Number(data.amount) || 0;

  const donationAmount = Number(data.donationAmount) || 0;

  const discountAmount = Number(data.discountAmount) || 0;

  const baseServiceAmount = Math.max(
    finalAmount - donationAmount + discountAmount,
    0,
  );

  const paymentStatusClass = normalizeStatusClass(data.statusClass);

  const bookingStatus = formatBookingStatus(data.bookingStatus);

  const websiteUrl = data.websiteUrl?.trim() || 'https://poojawala.com';

  const supportHours = data.supportHours?.trim() || 'Mon–Sat, 9:00 AM–7:00 PM';

  const currency = displayValue(data.currency);

  const logoMarkup = data.logoUrl?.trim()
    ? `
      <img
        src="${displayValue(data.logoUrl)}"
        alt="Poojawala"
        class="brand-logo-image"
      />
    `
    : `
      <div class="brand-symbol">
        ॐ
      </div>
    `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>
    ${displayValue(data.invoiceTitle)}
  </title>

  <style>
    :root {
      --primary: #c66b18;
      --primary-dark: #8c3b16;
      --accent: #f28c28;
      --cream: #fff8f2;
      --cream-soft: #fffdf9;
      --line: #efd9c8;
      --text: #3f2a1e;
      --muted: #7a665b;
      --success: #1f8a4c;
      --success-bg: #eaf7ef;
      --danger: #c0392b;
      --danger-bg: #fdecea;
      --warning: #b76e00;
      --warning-bg: #fff3dc;
      --info: #2e6cb8;
      --info-bg: #eaf2fb;
      --refund: #3b6fc4;
      --refund-bg: #e9f0ff;
    }

    * {
      box-sizing: border-box;
    }

    @page {
      size: A4;
      margin: 12mm;
    }

    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: var(--text);
      font-family:
        Arial,
        Helvetica,
        sans-serif;
      font-size: 11px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      position: relative;
      width: 100%;
      min-height: 100%;
      overflow: hidden;
      background:
        radial-gradient(
          circle at top right,
          rgba(242, 140, 40, 0.12),
          transparent 28%
        ),
        linear-gradient(
          180deg,
          #fffdf9 0%,
          #ffffff 45%,
          #fffdf9 100%
        );
      border: 1px solid var(--line);
      border-radius: 18px;
    }

    .top-stripe {
      height: 8px;
      background:
        linear-gradient(
          90deg,
          var(--primary-dark),
          var(--primary),
          #f6b73c
        );
    }

    .watermark {
      position: absolute;
      right: -36px;
      top: 38px;
      width: 180px;
      height: 180px;
      border: 1px solid rgba(198, 107, 24, 0.08);
      border-radius: 50%;
      opacity: 0.55;
    }

    .watermark::before,
    .watermark::after {
      content: '';
      position: absolute;
      inset: 22px;
      border: 1px solid rgba(198, 107, 24, 0.08);
      border-radius: 50%;
    }

    .watermark::after {
      inset: 48px;
    }

    .content {
      padding: 22px 24px 18px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-symbol,
    .brand-logo-image {
      width: 50px;
      height: 50px;
      border-radius: 14px;
    }

    .brand-symbol {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      background:
        linear-gradient(
          135deg,
          #ff9e35,
          var(--primary)
        );
      font-size: 28px;
      font-weight: 700;
      box-shadow:
        0 8px 20px
        rgba(198, 107, 24, 0.22);
    }

    .brand-logo-image {
      object-fit: contain;
      background: #ffffff;
    }

    .brand-copy h1 {
      margin: 0;
      font-size: 22px;
      color: var(--primary-dark);
      letter-spacing: -0.3px;
    }

    .brand-copy p {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 9px;
      letter-spacing: 1.2px;
      text-transform: uppercase;
    }

    .invoice-title {
      margin-top: 14px;
    }

    .invoice-title h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      color: #2f2018;
    }

    .invoice-title p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 10px;
    }

    .invoice-meta {
      width: 255px;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background:
        rgba(255, 255, 255, 0.86);
      box-shadow:
        0 8px 18px
        rgba(97, 53, 22, 0.06);
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 4px 0;
    }

    .meta-label {
      color: var(--muted);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }

    .meta-value {
      max-width: 150px;
      color: var(--text);
      font-size: 10px;
      font-weight: 700;
      text-align: right;
      overflow-wrap: anywhere;
    }

    .grid-two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 16px;
    }

    .card {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 14px;
      background:
        rgba(255, 255, 255, 0.92);
    }

    .card-title {
      padding: 9px 12px;
      color: var(--primary-dark);
      background:
        linear-gradient(
          90deg,
          #fff4e8,
          #fffaf5
        );
      border-bottom: 1px solid var(--line);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.9px;
      text-transform: uppercase;
    }

    .card-body {
      padding: 11px 12px;
    }

    .detail-row {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: 10px;
      padding: 3px 0;
      align-items: start;
    }

    .detail-label {
      color: var(--muted);
      font-size: 9px;
      font-weight: 600;
    }

    .detail-value {
      color: var(--text);
      font-size: 10px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .section {
      margin-top: 16px;
    }

    .section-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--primary-dark);
      font-size: 14px;
      font-weight: 800;
    }

    .section-heading::before {
      content: '';
      width: 5px;
      height: 17px;
      border-radius: 6px;
      background:
        linear-gradient(
          180deg,
          #ff9e35,
          var(--primary)
        );
    }

    .booking-card {
      display: grid;
      grid-template-columns:
        repeat(4, minmax(0, 1fr));
      gap: 0;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      background: #ffffff;
    }

    .booking-item {
      min-height: 68px;
      padding: 11px 12px;
      border-right: 1px solid var(--line);
    }

    .booking-item:last-child {
      border-right: 0;
    }

    .booking-item-label {
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    .booking-item-value {
      color: var(--text);
      font-size: 10px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .pill.success {
      color: var(--success);
      background: var(--success-bg);
    }

    .pill.failed {
      color: var(--danger);
      background: var(--danger-bg);
    }

    .pill.pending {
      color: var(--warning);
      background: var(--warning-bg);
    }

    .pill.refunded {
      color: var(--refund);
      background: var(--refund-bg);
    }

    .pill.info {
      color: var(--info);
      background: var(--info-bg);
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #ffffff;
    }

    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }

    th {
      color: var(--primary-dark);
      background:
        linear-gradient(
          90deg,
          #fff5e9,
          #fffaf5
        );
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.7px;
      text-align: left;
      text-transform: uppercase;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .amount {
      text-align: right;
      white-space: nowrap;
    }

    .negative {
      color: var(--success);
    }

    .total-row td {
      color: var(--primary-dark);
      background: #fffaf2;
      font-size: 12px;
      font-weight: 800;
    }

    .payment-grid {
      display: grid;
      grid-template-columns:
        repeat(3, minmax(0, 1fr));
      gap: 0;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      background: #ffffff;
    }

    .payment-cell {
      min-height: 66px;
      padding: 10px 12px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }

    .payment-cell:nth-child(3n) {
      border-right: 0;
    }

    .payment-cell:nth-last-child(-n + 3) {
      border-bottom: 0;
    }

    .payment-label {
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    .payment-value {
      color: var(--text);
      font-size: 9px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .amount-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      margin-top: 15px;
      padding: 14px 16px;
      color: #ffffff;
      border-radius: 14px;
      background:
        linear-gradient(
          135deg,
          var(--primary-dark),
          var(--primary)
        );
      box-shadow:
        0 10px 22px
        rgba(140, 59, 22, 0.18);
    }

    .amount-banner-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }

    .amount-banner-note {
      margin-top: 3px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 9px;
    }

    .amount-banner-value {
      font-size: 22px;
      font-weight: 800;
      white-space: nowrap;
    }

    .notice {
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px solid #f0d2ac;
      border-radius: 12px;
      color: #84501c;
      background: #fff7ea;
      font-size: 9px;
    }

    .error-box {
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid #f2b7b0;
      border-radius: 12px;
      color: var(--danger);
      background: var(--danger-bg);
      font-size: 9px;
      font-weight: 700;
    }

    .footer {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      margin-top: 15px;
      padding: 13px 14px;
      border-top: 1px solid var(--line);
      background:
        linear-gradient(
          90deg,
          #fff9f1,
          #fffdf9
        );
    }

    .footer h3 {
      margin: 0 0 5px;
      color: var(--primary-dark);
      font-size: 11px;
    }

    .footer p {
      margin: 2px 0;
      color: var(--muted);
      font-size: 8px;
    }

    .footer strong {
      color: var(--text);
    }

    .footer-right {
      text-align: right;
    }

    .legal {
      margin-top: 4px;
      color: #99877d;
      font-size: 7px;
    }

    @media print {
      body {
        background: #ffffff;
      }

      .page {
        border-radius: 0;
      }
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="top-stripe"></div>
    <div class="watermark"></div>

    <div class="content">
      <header class="header">
        <div>
          <div class="brand">
            ${logoMarkup}

            <div class="brand-copy">
              <h1>
                ${displayValue(data.companyName)}
              </h1>

              <p>
                Sacred rituals. Trusted Pandits.
              </p>
            </div>
          </div>

          <div class="invoice-title">
            <h2>
              ${isProformaInvoice ? 'Proforma Invoice' : 'Tax Invoice'}
            </h2>

            <p>
              Sacred ritual booking invoice
            </p>
          </div>
        </div>

        <div class="invoice-meta">
          <div class="meta-row">
            <span class="meta-label">
              Invoice ID
            </span>

            <span class="meta-value">
              ${displayValue(data.invoiceId)}
            </span>
          </div>

          <div class="meta-row">
            <span class="meta-label">
              Booking No.
            </span>

            <span class="meta-value">
              ${displayValue(data.bookingNumber)}
            </span>
          </div>

          <div class="meta-row">
            <span class="meta-label">
              ${displayValue(data.dateLabel)}
            </span>

            <span class="meta-value">
              ${displayValue(data.date)}
            </span>
          </div>
        </div>
      </header>

      <div class="grid-two">
        <section class="card">
          <div class="card-title">
            Bill To
          </div>

          <div class="card-body">
            <div class="detail-row">
              <div class="detail-label">
                Customer
              </div>

              <div class="detail-value">
                ${displayValue(data.customerName)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                Phone
              </div>

              <div class="detail-value">
                ${displayValue(data.customerPhone)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                Email
              </div>

              <div class="detail-value">
                ${displayValue(data.customerEmail)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                Address
              </div>

              <div class="detail-value">
                ${displayValue(data.billingAddress)}
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-title">
            Issued By
          </div>

          <div class="card-body">
            <div class="detail-row">
              <div class="detail-label">
                Company
              </div>

              <div class="detail-value">
                ${displayValue(data.companyName)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                Phone
              </div>

              <div class="detail-value">
                ${displayValue(data.companyPhone)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                Email
              </div>

              <div class="detail-value">
                ${displayValue(data.companyEmail)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                GSTIN
              </div>

              <div class="detail-value">
                ${displayValue(data.companyGstin)}
              </div>
            </div>

            <div class="detail-row">
              <div class="detail-label">
                Address
              </div>

              <div class="detail-value">
                ${displayValue(data.companyAddress)}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="section">
        <div class="section-heading">
          Booking Summary
        </div>

        <div class="booking-card">
          <div class="booking-item">
            <div class="booking-item-label">
              Booking ID
            </div>

            <div class="booking-item-value">
              ${displayValue(data.bookingId)}
            </div>
          </div>

          <div class="booking-item">
            <div class="booking-item-label">
              Service
            </div>

            <div class="booking-item-value">
              ${displayValue(data.serviceName)}
            </div>
          </div>

          <div class="booking-item">
            <div class="booking-item-label">
              Assigned Purohit
            </div>

            <div class="booking-item-value">
              ${displayValue(data.purohitName)}
            </div>
          </div>

          <div class="booking-item">
            <div class="booking-item-label">
              Booking Status
            </div>

            <div class="booking-item-value">
              <span class="pill ${bookingStatus.className}">
                ${displayValue(bookingStatus.label)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          Price Breakdown
        </div>

        <table>
          <thead>
            <tr>
              <th>
                Description
              </th>

              <th class="amount">
                Amount
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>
                ${displayValue(data.serviceName)}
                service charge
              </td>

              <td class="amount">
                ${currency}
                ${baseServiceAmount.toFixed(2)}
              </td>
            </tr>

            ${
              discountAmount > 0
                ? `
                  <tr>
                    <td>
                      Coupon discount
                      ${
                        data.couponCode?.trim()
                          ? `(${displayValue(data.couponCode)})`
                          : ''
                      }
                    </td>

                    <td class="amount negative">
                      -
                      ${currency}
                      ${discountAmount.toFixed(2)}
                    </td>
                  </tr>
                `
                : ''
            }

            ${
              donationAmount > 0
                ? `
                  <tr>
                    <td>
                      Voluntary donation
                    </td>

                    <td class="amount">
                      ${currency}
                      ${donationAmount.toFixed(2)}
                    </td>
                  </tr>
                `
                : ''
            }

            <tr class="total-row">
              <td>
                Total Payable Amount
              </td>

              <td class="amount">
                ${currency}
                ${finalAmount.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <div class="section-heading">
          Payment Details
        </div>

        <div class="payment-grid">
          <div class="payment-cell">
            <div class="payment-label">
              Payment Status
            </div>

            <div class="payment-value">
              <span class="pill ${paymentStatusClass}">
                ${displayValue(data.paymentStatus || 'Pending')}
              </span>
            </div>
          </div>

          <div class="payment-cell">
            <div class="payment-label">
              Payment Method
            </div>

            <div class="payment-value">
              ${displayValue(data.paymentMethod)}
            </div>
          </div>

          <div class="payment-cell">
            <div class="payment-label">
              Recorded Payment
            </div>

            <div class="payment-value">
              ${currency}
              ${paidAmount.toFixed(2)}
            </div>
          </div>

          <div class="payment-cell">
            <div class="payment-label">
              Razorpay Payment ID
            </div>

            <div class="payment-value">
              ${displayValue(data.paymentId)}
            </div>
          </div>

          <div class="payment-cell">
            <div class="payment-label">
              Razorpay Order ID
            </div>

            <div class="payment-value">
              ${displayValue(data.orderId)}
            </div>
          </div>

          <div class="payment-cell">
            <div class="payment-label">
              Invoice Type
            </div>

            <div class="payment-value">
              ${isProformaInvoice ? 'Proforma Invoice' : 'Tax Invoice'}
            </div>
          </div>
        </div>
      </section>

      <div class="amount-banner">
        <div>
          <div class="amount-banner-label">
            ${isProformaInvoice ? 'Amount Due' : 'Amount Paid'}
          </div>

          <div class="amount-banner-note">
            ${
              isProformaInvoice
                ? 'Payment confirmation is pending.'
                : 'Payment received successfully.'
            }
          </div>
        </div>

        <div class="amount-banner-value">
          ${currency}
          ${finalAmount.toFixed(2)}
        </div>
      </div>

      ${
        hasError
          ? `
            <div class="error-box">
              Payment issue:
              ${displayValue(data.errorMessage)}
            </div>
          `
          : ''
      }

      ${
        isProformaInvoice
          ? `
            <div class="notice">
              <strong>Proforma notice:</strong>
              This document is generated before successful
              payment and is not a final tax invoice. A final
              invoice will become available after payment
              confirmation.
            </div>
          `
          : `
            <div class="notice">
              <strong>Payment confirmed:</strong>
              This is a system-generated tax invoice for the
              successfully recorded booking payment.
            </div>
          `
      }
    </div>

    <footer class="footer">
      <div>
        <h3>
          Thank you for choosing Poojawala.
        </h3>

        <p>
          Trusted Puja services for sacred moments.
        </p>

        <p class="legal">
          This is a system-generated invoice and does not
          require a physical signature.
        </p>
      </div>

      <div class="footer-right">
        <h3>
          Need help?
        </h3>

        <p>
          <strong>Email:</strong>
          ${displayValue(data.companyEmail)}
        </p>

        <p>
          <strong>Phone:</strong>
          ${displayValue(data.companyPhone)}
        </p>

        <p>
          <strong>Support:</strong>
          ${displayValue(supportHours)}
        </p>

        <p>
          <strong>Website:</strong>
          ${displayValue(websiteUrl)}
        </p>
      </div>
    </footer>
  </div>
</body>
</html>
`;
};
