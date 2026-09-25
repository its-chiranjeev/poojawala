import { renderPoojawalaEmail } from './email-base.template';

describe('renderPoojawalaEmail - Global Payment Status in Navbar', () => {
  it('should render PAID payment status badge on the right side of detailsTable navbar and omit from rows', () => {
    const html = renderPoojawalaEmail({
      statusBadge: 'Order Processing',
      userName: 'Chiranjeev',
      preheaderText: 'Order ORD-8 is now PROCESSING',
      emailMessage: 'Your order <strong>ORD-8</strong> has been updated to <strong>PROCESSING</strong>.',
      detailsTable: {
        title: 'Order Status Update',
        rows: [
          { label: 'Order Number', value: 'ORD-8' },
          { label: 'New Status', value: 'PROCESSING', isHighlight: true },
          { label: 'Previous Status', value: 'CONFIRMED' },
          { label: 'Payment Status', value: 'PAID' },
          { label: 'Payment Method', value: 'Online Payment' },
          { label: 'Total Amount', value: '₹1450.00' },
        ],
      },
    });

    // Header bar must contain both title and badge
    expect(html).toContain('🪔 Order Status Update');
    expect(html).toContain('✓ PAID');
    expect(html).toContain('#E8F5E9'); // Green badge background
    expect(html).toContain('#2E7D32'); // Green badge text color

    // Payment Status row should be moved to navbar and not duplicated as a table row label
    expect(html).not.toContain('>Payment Status:<');
    expect(html).toContain('Order ID:');
    expect(html).not.toContain('Order Number:');
    expect(html).toContain('ORD-8');
    expect(html).toContain('PROCESSING');
  });

  it('should render COD Pending badge with amber style', () => {
    const html = renderPoojawalaEmail({
      statusBadge: 'Order Placed',
      userName: 'Devotee',
      emailMessage: 'Your order has been placed.',
      detailsTable: {
        title: 'Order Details',
        rows: [
          { label: 'Order Number', value: 'ORD-10' },
          { label: 'Payment Status', value: 'COD Pending' },
          { label: 'Total Amount', value: '₹500.00' },
        ],
      },
    });

    expect(html).toContain('🪔 Order Details');
    expect(html).toContain('⏳ COD Pending');
    expect(html).toContain('#FFF3E0');
  });

  it('should render PENDING badge with amber style', () => {
    const html = renderPoojawalaEmail({
      statusBadge: 'Order Created',
      userName: 'Devotee',
      emailMessage: 'Please complete payment.',
      detailsTable: {
        title: 'Order Details',
        rows: [
          { label: 'Order Number', value: 'ORD-12' },
          { label: 'Payment Status', value: 'PENDING' },
        ],
      },
    });

    expect(html).toContain('⏳ PENDING');
  });

  it('should render explicit paymentStatus from detailsTable or options', () => {
    const html = renderPoojawalaEmail({
      statusBadge: 'Booking Confirmed',
      userName: 'Devotee',
      emailMessage: 'Your puja is confirmed.',
      detailsTable: {
        title: 'Booking & Payment Details',
        paymentStatus: 'PAID',
        rows: [
          { label: 'Booking ID', value: '#BK-100' },
          { label: 'Total Amount', value: '₹2100.00' },
        ],
      },
    });

    expect(html).toContain('🪔 Booking &amp; Payment Details');
    expect(html).toContain('✓ PAID');
  });

  it('should not render badge if no paymentStatus is present', () => {
    const html = renderPoojawalaEmail({
      statusBadge: 'Account Created',
      userName: 'Devotee',
      emailMessage: 'Your account is ready.',
      detailsTable: {
        title: 'Account Credentials',
        rows: [
          { label: 'Username', value: 'devotee123' },
          { label: 'Email', value: 'devotee@example.com' },
        ],
      },
    });

    expect(html).toContain('🪔 Account Credentials');
    expect(html).not.toContain('✓');
    expect(html).not.toContain('⏳');
  });
});
