export interface PaymentInvoiceTemplateData {
  invoiceTitle: string;
  invoiceId: string;
  dateLabel: string;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  serviceName: string;
  bookingId: number;
  bookingStatus: string;

  paymentId: string;
  orderId: string;
  paymentStatus: string;
  paymentMethod: string;

  currency: string;
  amount: string;

  date: string;
  statusClass: string;
  errorMessage: string;

  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  companyGstin: string;

  billingAddress: string;
  technicianName: string;

  serviceBasePrice: string;
  gstPercent: string;
  gstAmount: string;
  platformFee: string;
  finalAmount: string;
}

export const paymentInvoiceTemplate = (
  data: PaymentInvoiceTemplateData,
): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 30px;
      font-family: Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      font-size: 14px;
    }

    .container {
      width: 100%;
      background: #ffffff;
      padding: 35px;
      border-radius: 10px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      border-bottom: 2px solid #dddddd;
      padding-bottom: 15px;
    }

    .header h2 {
      margin: 0 0 10px;
      font-size: 25px;
    }

    .header p {
      margin: 5px 0;
    }

    .date-section {
      text-align: right;
    }

    .section-title {
      margin-top: 28px;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 17px;
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
      width: 170px;
      font-weight: bold;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    td {
      border: 1px solid #dddddd;
      padding: 10px;
      word-break: break-word;
    }

    td:first-child {
      width: 42%;
    }

    .success {
      color: #16a34a;
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

    .total {
      text-align: right;
      font-size: 22px;
      font-weight: bold;
      margin-top: 25px;
    }

    .footer {
      margin-top: 45px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #555555;
      line-height: 1.6;
    }

    .gst-note {
      margin-top: 8px;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>

<body>
  <div class="container">

    <div class="header">
      <div>
        <h2>${data.invoiceTitle}</h2>
        <p>
          <strong>Invoice ID:</strong>
          ${data.invoiceId || '-'}
        </p>
      </div>

      <div class="date-section">
        <p>
          <strong>${data.dateLabel}:</strong>
          ${data.date || '-'}
        </p>
      </div>
    </div>

    <h3 class="section-title">Company Details</h3>

    <div class="detail-grid">
      <div class="detail-row">
        <div class="detail-label">Name:</div>
        <div class="detail-value">
          ${data.companyName || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Email:</div>
        <div class="detail-value">
          ${data.companyEmail || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Phone:</div>
        <div class="detail-value">
          ${data.companyPhone || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Address:</div>
        <div class="detail-value">
          ${data.companyAddress || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">GSTIN:</div>
        <div class="detail-value">
          ${data.companyGstin || '-'}
        </div>
      </div>
    </div>

    <h3 class="section-title">Customer Details</h3>

    <div class="detail-grid">
      <div class="detail-row">
        <div class="detail-label">Name:</div>
        <div class="detail-value">
          ${data.customerName || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Email:</div>
        <div class="detail-value">
          ${data.customerEmail || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Phone:</div>
        <div class="detail-value">
          ${data.customerPhone || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Billing Address:</div>
        <div class="detail-value">
          ${data.billingAddress || '-'}
        </div>
      </div>
    </div>

    <h3 class="section-title">Booking Details</h3>

    <div class="detail-grid">
      <div class="detail-row">
        <div class="detail-label">Booking ID:</div>
        <div class="detail-value">
          ${data.bookingId}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Service:</div>
        <div class="detail-value">
          ${data.serviceName || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Technician:</div>
        <div class="detail-value">
          ${data.technicianName || '-'}
        </div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Booking Status:</div>
        <div class="detail-value">
          ${data.bookingStatus || '-'}
        </div>
      </div>
    </div>

    <h3 class="section-title">Pricing Breakdown</h3>

    <table>
      <tr>
        <td>Service Base Price</td>
        <td>
          ${data.currency} ${data.serviceBasePrice}
        </td>
      </tr>

      <tr>
        <td>GST (${data.gstPercent}%)</td>
        <td>
          ${data.currency} ${data.gstAmount}
        </td>
      </tr>

      <tr>
        <td>Platform Fee</td>
        <td>
          ${data.currency} ${data.platformFee}
        </td>
      </tr>

      <tr>
        <td>
          <strong>Final Amount</strong>
        </td>
        <td>
          <strong>
            ${data.currency} ${data.finalAmount}
          </strong>
        </td>
      </tr>
    </table>

    <h3 class="section-title">Payment Details</h3>

    <table>
      <tr>
        <td>Payment Status</td>
        <td class="${data.statusClass}">
          ${data.paymentStatus || 'Pending'}
        </td>
      </tr>

      <tr>
        <td>Payment Method</td>
        <td>
          ${data.paymentMethod || '-'}
        </td>
      </tr>

      <tr>
        <td>Transaction ID</td>
        <td>
          ${data.paymentId || '-'}
        </td>
      </tr>

      <tr>
        <td>Order ID</td>
        <td>
          ${data.orderId || '-'}
        </td>
      </tr>

      ${
        data.errorMessage && data.errorMessage !== '-'
          ? `
            <tr>
              <td>Error</td>
              <td>${data.errorMessage}</td>
            </tr>
          `
          : ''
      }
    </table>

    <p class="total">
      Total: ${data.currency} ${data.finalAmount}
    </p>

    <div class="footer">
      ${
        data.invoiceTitle === 'HiChandra Proforma Invoice'
          ? `
            <p>
              <strong>Note:</strong>
              This is a Proforma Invoice generated for a booking
              with pending payment. It is not a final tax invoice.
              A final invoice will be available after successful
              payment.
            </p>
          `
          : `
            <p>
              Payment received successfully.
              Thank you for using HiChandra.
            </p>

            <p class="gst-note">
              This invoice includes GST at the rate mentioned
              in the pricing breakdown.
            </p>
          `
      }
    </div>

  </div>
</body>
</html>
`;
};