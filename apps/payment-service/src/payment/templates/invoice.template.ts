export type InvoiceType = 'BOOKING' | 'ORDER';

export interface InvoiceOrderItem {
  productName: string;
  quantity: number;
  unitPrice: number | string;
  totalAmount: number | string;
}

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

  invoiceType?: InvoiceType;

  // Booking-specific fields
  bookingId?: number;
  bookingNumber?: string;
  bookingStatus?: string;
  bookingType?: string;
  serviceName?: string;
  purohitName?: string;
  astrologerName?: string;
  donationAmount?: string;

  // Order-specific fields
  orderNumber?: string;
  orderStatus?: string;
  orderItems?: InvoiceOrderItem[];
  subtotal?: string | number;
  feeAmount?: string | number;
  taxAmount?: string | number;

  paymentId: string;
  orderId: string;
  razorpayOrderId?: string;
  paymentStatus: string;
  paymentMethod: string;
  statusClass: string;
  errorMessage: string;

  currency: string;
  amount: string;
  finalAmount: string;
  discountAmount?: string;

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

  customerPaidAmount?: string | number | null;
  razorpayFee?: string | number | null;
  razorpayTax?: string | number | null;

  paidAmount?: string | number | null;
  remainingAmount?: string | number | null;
  tokenAmount?: string | number | null;

  [key: string]: any;
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
  bookingStatus?: string,
): {
  label: string;
  className: string;
} => {
  const normalized = (bookingStatus || '').trim().toUpperCase();

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

const formatOrderStatus = (
  orderStatus?: string,
): {
  label: string;
  className: string;
} => {
  const normalized = (orderStatus || '').trim().toUpperCase();

  switch (normalized) {
    case 'DELIVERED':
    case 'CONFIRMED':
      return {
        label: normalized === 'DELIVERED' ? 'Delivered' : 'Confirmed',
        className: 'success',
      };

    case 'CANCELLED':
    case 'EXPIRED':
      return {
        label: normalized === 'CANCELLED' ? 'Cancelled' : 'Expired',
        className: 'failed',
      };

    case 'SHIPPED':
      return {
        label: 'Shipped',
        className: 'info',
      };

    case 'OUT_FOR_DELIVERY':
      return {
        label: 'Out for Delivery',
        className: 'info',
      };

    case 'PROCESSING':
      return {
        label: 'Processing',
        className: 'info',
      };

    case 'RETURN_REQUESTED':
    case 'RETURNED':
      return {
        label:
          normalized === 'RETURN_REQUESTED'
            ? 'Return Requested'
            : 'Returned',
        className: 'refunded',
      };

    default:
      return {
        label: normalized.replace(/_/g, ' ') || 'Pending',
        className: 'pending',
      };
  }
};

export const paymentInvoiceTemplate = (
  data: PaymentInvoiceTemplateData,
): string => {
  const isOrder =
    data.invoiceType === 'ORDER' ||
    Boolean(data.orderItems && data.orderItems.length > 0);

  const isAstrology =
    (data.bookingType || '').trim().toUpperCase() === 'ASTROLOGY' ||
    Boolean(data.astrologerName && !data.purohitName);

  const bookingTypeDisplay = isAstrology ? 'Astrology' : 'Pooja';

  const assignedPersonLabel = isAstrology
    ? 'Assigned Astrologer'
    : 'Assigned Purohit';

  const assignedPersonValue = isAstrology
    ? (data.astrologerName || data.purohitName)
    : data.purohitName;

  const isProformaInvoice = data.invoiceTitle
    .toLowerCase()
    .includes('proforma');

  const hasError =
    Boolean(data.errorMessage) && data.errorMessage.trim() !== '-';

  const finalAmount = Number(data.finalAmount) || 0;

  const paidAmount = Number(data.amount) || 0;

  const donationAmount = Number(data.donationAmount) || 0;

  const discountAmount = Number(data.discountAmount) || 0;

  const feeAmount = Number(data.feeAmount) || 0;

  const taxAmount = Number(data.taxAmount) || 0;

  const rawCustomerPaid =
    data.customerPaidAmount != null && !isNaN(Number(data.customerPaidAmount))
      ? Number(data.customerPaidAmount)
      : (paidAmount > 0 ? paidAmount : null);

  const rawRazorpayFee =
    data.razorpayFee != null && !isNaN(Number(data.razorpayFee))
      ? Number(data.razorpayFee)
      : null;

  const rawRazorpayTax =
    data.razorpayTax != null && !isNaN(Number(data.razorpayTax))
      ? Number(data.razorpayTax)
      : null;

  const showRazorpayCharges =
    rawCustomerPaid != null &&
    rawCustomerPaid - finalAmount > 0.01 &&
    rawRazorpayFee != null &&
    rawRazorpayFee > 0;

  const isPaid =
    data.paymentStatus?.toLowerCase() === 'paid' ||
    data.paymentStatus?.toLowerCase() === 'success' ||
    data.statusClass?.toLowerCase() === 'success';

  const currency = displayValue(data.currency);

  const customerPaidDisplay =
    rawCustomerPaid != null
      ? `${currency} ${rawCustomerPaid.toFixed(2)}`
      : isPaid
        ? `${currency} ${finalAmount.toFixed(2)}`
        : '-';

  const razorpayFeeDisplay =
    rawRazorpayFee != null
      ? `${currency} ${rawRazorpayFee.toFixed(2)}`
      : '-';

  const razorpayTaxDisplay =
    rawRazorpayTax != null
      ? `${currency} ${rawRazorpayTax.toFixed(2)}`
      : '-';

  const baseServiceAmount = Math.max(
    finalAmount - donationAmount + discountAmount,
    0,
  );

  const subtotal =
    data.subtotal != null ? Number(data.subtotal) || 0 : baseServiceAmount;

  const paymentStatusClass = normalizeStatusClass(data.statusClass);

  const bookingStatus = formatBookingStatus(data.bookingStatus);
  const orderStatus = formatOrderStatus(data.orderStatus);

  const envWebsiteUrl =
    process.env['FRONTEND_URL']?.trim() ||
    process.env['FRONTEND_PAYMENT_CALLBACK_URL']?.trim();

  const websiteUrl = (
    data.websiteUrl?.trim() ||
    envWebsiteUrl ||
    'https://1pooja.com'
  ).replace(/\/+$/, '');

  const supportHours = data.supportHours?.trim() || 'Mon–Sat, 9:00 AM–7:00 PM';

  const logoMarkup = data.logoUrl?.trim()
    ? `
      <img
        src="${displayValue(data.logoUrl)}"
        alt="1Pooja"
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
      zoom: 0.92;
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
      page-break-after: avoid;
      page-break-inside: avoid;
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
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
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

    .astrology-notice {
      margin-top: 12px;
      padding: 10px 14px;
      border: 1px solid rgba(224, 86, 36, 0.4);
      border-radius: 12px;
      color: #84501c;
      background: #fff8f3;
      font-size: 9px;
      line-height: 1.5;
    }

    .astrology-notice strong {
      color: var(--primary-dark);
      display: inline-block;
      margin-right: 4px;
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
              ${isOrder
      ? 'Devotional products order invoice'
      : (isAstrology
        ? 'Astrology platform access fee receipt'
        : 'Sacred ritual booking invoice')
    }
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
              ${isOrder ? 'Order No.' : 'Booking No.'}
            </span>

            <span class="meta-value">
              ${displayValue(isOrder ? data.orderId : data.bookingId)}
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

      ${isOrder
      ? `
            <section class="section">
              <div class="section-heading">
                Order Summary
              </div>

              <div class="booking-card">
                <div class="booking-item">
                  <div class="booking-item-label">
                    Order ID
                  </div>

                  <div class="booking-item-value">
                    ${displayValue(data.orderId)}
                  </div>
                </div>

                <div class="booking-item">
                  <div class="booking-item-label">
                    Order Date
                  </div>

                  <div class="booking-item-value">
                    ${displayValue(data.date)}
                  </div>
                </div>

                <div class="booking-item">
                  <div class="booking-item-label">
                    Order Status
                  </div>

                  <div class="booking-item-value">
                    <span class="pill ${orderStatus.className}">
                      ${displayValue(orderStatus.label)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          `
      : `
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
                    Booking Type
                  </div>

                  <div class="booking-item-value">
                    ${displayValue(bookingTypeDisplay)}
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
                    ${assignedPersonLabel}
                  </div>

                  <div class="booking-item-value">
                    ${displayValue(assignedPersonValue)}
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
          `
    }

      <section class="section">
        <div class="section-heading">
          Price Breakdown
        </div>

        <table>
          <thead>
            ${isOrder
      ? `
                  <tr>
                    <th>
                      Product
                    </th>

                    <th style="text-align: center; width: 60px;">
                      Qty
                    </th>

                    <th class="amount" style="width: 100px;">
                      Unit Price
                    </th>

                    <th class="amount" style="width: 110px;">
                      Total
                    </th>
                  </tr>
                `
      : `
                  <tr>
                    <th>
                      Description
                    </th>

                    <th class="amount">
                      Amount
                    </th>
                  </tr>
                `
    }
          </thead>

          <tbody>
            ${isOrder
      ? `
                  ${(data.orderItems || [])
        .map(
          (item) => `
                        <tr>
                          <td>
                            ${displayValue(item.productName)}
                          </td>

                          <td style="text-align: center;">
                            ${Number(item.quantity) || 1}
                          </td>

                          <td class="amount">
                            ${currency}
                            ${(Number(item.unitPrice) || 0).toFixed(2)}
                          </td>

                          <td class="amount">
                            ${currency}
                            ${(Number(item.totalAmount) || 0).toFixed(2)}
                          </td>
                        </tr>
                      `,
        )
        .join('')}

                  <tr>
                    <td colspan="3" style="font-weight: 700; color: var(--text);">
                      Subtotal
                    </td>

                    <td class="amount" style="font-weight: 700; color: var(--text);">
                      ${currency}
                      ${subtotal.toFixed(2)}
                    </td>
                  </tr>

                  ${discountAmount > 0
        ? `
                        <tr>
                          <td colspan="3">
                            Discount
                            ${data.couponCode?.trim()
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

                  ${feeAmount > 0
        ? `
                        <tr>
                          <td colspan="3">
                            Delivery / Handling Fee
                          </td>

                          <td class="amount">
                            ${currency}
                            ${feeAmount.toFixed(2)}
                          </td>
                        </tr>
                      `
        : ''
      }

                  ${taxAmount > 0
        ? `
                        <tr>
                          <td colspan="3">
                            Tax (GST)
                          </td>

                          <td class="amount">
                            ${currency}
                            ${taxAmount.toFixed(2)}
                          </td>
                        </tr>
                      `
        : ''
      }

                  ${showRazorpayCharges && rawRazorpayFee != null && rawRazorpayFee > 0
                    ? `
                        <tr>
                          <td colspan="3">
                            Razorpay Fee
                          </td>
                          <td class="amount">
                            ${currency}
                            ${rawRazorpayFee.toFixed(2)}
                          </td>
                        </tr>
                      `
                    : ''
                  }

                  <tr class="total-row">
                    <td colspan="3">
                      ${isPaid ? 'Total Paid Amount' : 'Total Payable Amount'}
                    </td>

                    <td class="amount">
                      ${currency}
                      ${(showRazorpayCharges && rawCustomerPaid != null ? rawCustomerPaid : finalAmount).toFixed(2)}
                    </td>
                  </tr>
                `
      : `
                  <tr>
                    <td>
                      ${isAstrology
                        ? 'Astrology Platform Access Fee'
                        : `${displayValue(data.serviceName)} service charge`
                      }
                    </td>

                    <td class="amount">
                      ${currency}
                      ${baseServiceAmount.toFixed(2)}
                    </td>
                  </tr>

                  ${discountAmount > 0
        ? `
                        <tr>
                          <td>
                            Coupon discount
                            ${data.couponCode?.trim()
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

                  ${donationAmount > 0
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

                  ${feeAmount > 0
        ? `
                        <tr>
                          <td>
                            Platform / Convenience Fee
                          </td>

                          <td class="amount">
                            ${currency}
                            ${feeAmount.toFixed(2)}
                          </td>
                        </tr>
                      `
        : ''
      }

                  ${taxAmount > 0
        ? `
                        <tr>
                          <td>
                            Tax (GST)
                          </td>

                          <td class="amount">
                            ${currency}
                            ${taxAmount.toFixed(2)}
                          </td>
                        </tr>
                      `
        : ''
      }

                  ${showRazorpayCharges && rawRazorpayFee != null && rawRazorpayFee > 0
                    ? `
                        <tr>
                          <td>
                            Razorpay Fee
                          </td>
                          <td class="amount">
                            ${currency}
                            ${rawRazorpayFee.toFixed(2)}
                          </td>
                        </tr>
                      `
                    : ''
                  }

                  <tr class="total-row">
                    <td>
                      ${isPaid
                        ? (isAstrology ? 'Total Paid to 1Pooja' : 'Total Paid Amount')
                        : (isAstrology ? 'Total Payable to 1Pooja' : 'Total Payable Amount')
                      }
                    </td>

                    <td class="amount">
                      ${currency}
                      ${(showRazorpayCharges && rawCustomerPaid != null ? rawCustomerPaid : finalAmount).toFixed(2)}
                    </td>
                  </tr>

                  ${!isAstrology && data.paidAmount != null
                    ? `
                        <tr>
                          <td>Paid Amount</td>
                          <td class="amount">${currency} ${(Number(data.paidAmount) || 0).toFixed(2)}</td>
                        </tr>
                      `
                    : ''
                  }
                  ${!isAstrology && data.remainingAmount != null
                    ? `
                        <tr>
                          <td>Remaining Balance</td>
                          <td class="amount">${currency} ${(Number(data.remainingAmount) || 0).toFixed(2)}</td>
                        </tr>
                      `
                    : ''
                  }
                `
    }
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
              Customer Paid Amount
            </div>

            <div class="payment-value" style="font-weight: 800; color: var(--primary-dark);">
              ${customerPaidDisplay}
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
              ${displayValue(data.razorpayOrderId ?? (isOrder ? '-' : data.orderId))}
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

          ${showRazorpayCharges
            ? `
                <div class="payment-cell">
                  <div class="payment-label">
                    Razorpay Fee
                  </div>

                  <div class="payment-value">
                    ${razorpayFeeDisplay}
                  </div>
                </div>

                <div class="payment-cell">
                  <div class="payment-label">
                    Recorded Amount
                  </div>

                  <div class="payment-value">
                    ${currency} ${finalAmount.toFixed(2)}
                  </div>
                </div>
              `
            : ''
          }
        </div>
      </section>

      <div class="amount-banner">
        <div>
          <div class="amount-banner-label">
            ${isProformaInvoice ? 'Amount Due' : 'Amount Paid'}
          </div>

          <div class="amount-banner-note">
            ${isProformaInvoice
              ? 'Payment confirmation is pending.'
              : showRazorpayCharges
                ? `Customer payment received via Razorpay (Fee: ${currency} ${(rawRazorpayFee ?? 0).toFixed(2)})`
                : 'Payment received successfully.'
            }
          </div>
        </div>

        <div class="amount-banner-value">
          ${customerPaidDisplay !== '-' ? customerPaidDisplay : `${currency} ${finalAmount.toFixed(2)}`}
        </div>
      </div>

      ${hasError
      ? `
            <div class="error-box">
              Payment issue:
              ${displayValue(data.errorMessage)}
            </div>
          `
      : ''
    }

      ${isProformaInvoice
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
              successfully recorded ${isOrder ? 'order' : 'booking'} payment.
            </div>
          `
    }

      ${isAstrology
      ? `
            <div class="notice astrology-notice">
              <strong>Important: Consultation Charges</strong><br />
              The amount paid to 1Pooja covers the astrology platform access fee only. Astrology consultation charges are separate and payable directly to the assigned astrologer at their applicable per-minute rate. 1Pooja does not collect these consultation charges.
            </div>
          `
      : ''
    }
    </div>

    <footer class="footer">
      <div>
        <h3>
          Thank you for choosing 1Pooja.
        </h3>

        <p>
          ${isOrder
      ? 'Devotional products and sacred items for your home and rituals.'
      : (isAstrology
        ? 'Trusted Astrology consultation and guidance services.'
        : 'Trusted Puja services for sacred moments.')
    }
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
