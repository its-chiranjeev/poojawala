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

  /*
   * finalAmount normally contains the payable amount after
   * donation and discount calculations.
   *
   * This value is only displayed as an estimated service
   * amount because the Booking entity currently does not
   * provide a separate base-price field to this template.
   */
  const estimatedServiceAmount = Math.max(
    finalAmount - donationAmount + discountAmount,
    0,
  );

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
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 24px;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
      background: #f3f4f6;
      color: #111827;
      font-size: 14px;
      line-height: 1.5;
    }

    .container {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      padding: 34px;
      border-radius: 10px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 18px;
      border-bottom: 2px solid #e5e7eb;
    }

    .brand-name {
      margin: 0 0 6px;
      font-size: 16px;
      color: #6b7280;
    }

    .header h1 {
      margin: 0 0 10px;
      font-size: 26px;
      color: #111827;
    }

    .header p {
      margin: 4px 0;
    }

    .date-section {
      min-width: 220px;
      text-align: right;
    }

    .section-title {
      margin-top: 28px;
      margin-bottom: 12px;
      padding-bottom: 7px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 17px;
      color: #1f2937;
    }

    .detail-grid {
      display: table;
      width: 100%;
    }

    .detail-row {
      display: table-row;
    }

    .detail-label,
    .detail-value {
      display: table-cell;
      padding: 5px 0;
      vertical-align: top;
    }

    .detail-label {
      width: 180px;
      padding-right: 15px;
      font-weight: bold;
      color: #374151;
    }

    .detail-value {
      color: #111827;
      word-break: break-word;
    }

    table {
      width: 100%;
      margin-top: 14px;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 11px;
      border: 1px solid #d1d5db;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      background: #f9fafb;
      font-weight: bold;
      color: #374151;
    }

    td:first-child {
      width: 48%;
    }

    .amount-cell {
      text-align: right;
      white-space: nowrap;
    }

    .success {
      color: #15803d;
      font-weight: bold;
    }

    .failed {
      color: #dc2626;
      font-weight: bold;
    }

    .pending {
      color: #d97706;
      font-weight: bold;
    }

    .refunded {
      color: #2563eb;
      font-weight: bold;
    }

    .total-box {
      margin-top: 24px;
      padding: 18px;
      border: 1px solid #d1d5db;
      background: #f9fafb;
      text-align: right;
      border-radius: 6px;
    }

    .total-label {
      margin-right: 15px;
      font-size: 16px;
      font-weight: bold;
    }

    .total-amount {
      font-size: 23px;
      font-weight: bold;
      color: #111827;
    }

    .payment-note {
      margin-top: 10px;
      color: #6b7280;
      font-size: 12px;
    }

    .error-message {
      color: #dc2626;
      font-weight: bold;
    }

    .footer {
      margin-top: 42px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      line-height: 1.6;
    }

    .footer p {
      margin: 6px 0;
    }

    .invoice-note {
      padding: 12px;
      border-radius: 5px;
      background: #fffbeb;
      color: #92400e;
    }

    .tax-note {
      margin-top: 9px;
      font-size: 12px;
      color: #6b7280;
    }

    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }

      .container {
        max-width: none;
        padding: 22px;
        border-radius: 0;
      }
    }
  </style>
</head>

<body>
  <div class="container">

    <div class="header">
      <div>
        <p class="brand-name">
          ${displayValue(data.companyName)}
        </p>

        <h1>
          ${displayValue(data.invoiceTitle)}
        </h1>

        <p>
          <strong>Invoice ID:</strong>
          ${displayValue(data.invoiceId)}
        </p>

        <p>
          <strong>Booking Number:</strong>
          ${displayValue(data.bookingNumber)}
        </p>
      </div>

      <div class="date-section">
        <p>
          <strong>
            ${displayValue(data.dateLabel)}:
          </strong>

          ${displayValue(data.date)}
        </p>
      </div>
    </div>

    <h2 class="section-title">
      Company Details
    </h2>

    <div class="detail-grid">
      <div class="detail-row">
        <div class="detail-label">
          Company Name:
        </div>

        <div class="detail-value">
          ${displayValue(data.companyName)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Email:
        </div>

        <div class="detail-value">
          ${displayValue(data.companyEmail)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Phone:
        </div>

        <div class="detail-value">
          ${displayValue(data.companyPhone)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Address:
        </div>

        <div class="detail-value">
          ${displayValue(data.companyAddress)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          GSTIN:
        </div>

        <div class="detail-value">
          ${displayValue(data.companyGstin)}
        </div>
      </div>
    </div>

    <h2 class="section-title">
      Customer Details
    </h2>

    <div class="detail-grid">
      <div class="detail-row">
        <div class="detail-label">
          Customer Name:
        </div>

        <div class="detail-value">
          ${displayValue(data.customerName)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Email:
        </div>

        <div class="detail-value">
          ${displayValue(data.customerEmail)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Phone:
        </div>

        <div class="detail-value">
          ${displayValue(data.customerPhone)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Billing Address:
        </div>

        <div class="detail-value">
          ${displayValue(data.billingAddress)}
        </div>
      </div>
    </div>

    <h2 class="section-title">
      Booking Details
    </h2>

    <div class="detail-grid">
      <div class="detail-row">
        <div class="detail-label">
          Booking ID:
        </div>

        <div class="detail-value">
          ${displayValue(data.bookingId)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Booking Number:
        </div>

        <div class="detail-value">
          ${displayValue(data.bookingNumber)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Service:
        </div>

        <div class="detail-value">
          ${displayValue(data.serviceName)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Purohit:
        </div>

        <div class="detail-value">
          ${displayValue(data.purohitName)}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">
          Booking Status:
        </div>

        <div class="detail-value">
          ${displayValue(data.bookingStatus)}
        </div>
      </div>
    </div>

    <h2 class="section-title">
      Pricing Details
    </h2>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="amount-cell">Amount</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td>Estimated Service Amount</td>

          <td class="amount-cell">
            ${displayValue(data.currency)}
            ${estimatedServiceAmount.toFixed(2)}
          </td>
        </tr>

        ${
          donationAmount > 0
            ? `
              <tr>
                <td>Donation Amount</td>

                <td class="amount-cell">
                  ${displayValue(data.currency)}
                  ${donationAmount.toFixed(2)}
                </td>
              </tr>
            `
            : ''
        }

        ${
          discountAmount > 0
            ? `
              <tr>
                <td>Discount</td>

                <td class="amount-cell">
                  -
                  ${displayValue(data.currency)}
                  ${discountAmount.toFixed(2)}
                </td>
              </tr>
            `
            : ''
        }

        <tr>
          <td>
            <strong>Final Booking Amount</strong>
          </td>

          <td class="amount-cell">
            <strong>
              ${displayValue(data.currency)}
              ${finalAmount.toFixed(2)}
            </strong>
          </td>
        </tr>
      </tbody>
    </table>

    <h2 class="section-title">
      Payment Details
    </h2>

    <table>
      <tbody>
        <tr>
          <td>Payment Status</td>

          <td class="${displayValue(data.statusClass)}">
            ${displayValue(data.paymentStatus || 'Pending')}
          </td>
        </tr>

        <tr>
          <td>Payment Method</td>

          <td>
            ${displayValue(data.paymentMethod)}
          </td>
        </tr>

        <tr>
          <td>Razorpay Payment ID</td>

          <td>
            ${displayValue(data.paymentId)}
          </td>
        </tr>

        <tr>
          <td>Razorpay Order ID</td>

          <td>
            ${displayValue(data.orderId)}
          </td>
        </tr>

        <tr>
          <td>Recorded Payment Amount</td>

          <td>
            ${displayValue(data.currency)}
            ${paidAmount.toFixed(2)}
          </td>
        </tr>

        ${
          hasError
            ? `
              <tr>
                <td>Payment Error</td>

                <td class="error-message">
                  ${displayValue(data.errorMessage)}
                </td>
              </tr>
            `
            : ''
        }
      </tbody>
    </table>

    <div class="total-box">
      <span class="total-label">
        Total Amount:
      </span>

      <span class="total-amount">
        ${displayValue(data.currency)}
        ${finalAmount.toFixed(2)}
      </span>

      ${
        !isProformaInvoice && paidAmount !== finalAmount
          ? `
            <p class="payment-note">
              The recorded Razorpay payment amount is
              ${displayValue(data.currency)}
              ${paidAmount.toFixed(2)}.
            </p>
          `
          : ''
      }
    </div>

    <div class="footer">
      ${
        isProformaInvoice
          ? `
            <div class="invoice-note">
              <strong>Note:</strong>

              This is a proforma invoice generated before
              successful payment. It is not a final tax
              invoice. The final invoice will become
              available after payment confirmation.
            </div>
          `
          : `
            <p>
              Payment received successfully.
            </p>

            <p>
              Thank you for choosing Poojawala.
            </p>

            <p class="tax-note">
              This is a system-generated invoice and does
              not require a physical signature.
            </p>
          `
      }
    </div>

  </div>
</body>
</html>
`;
};
