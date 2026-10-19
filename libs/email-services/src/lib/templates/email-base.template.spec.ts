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

  describe('Centralized platformDomainName and Brand Rendering', () => {
    it('should render 1Pooja branding and not contain poojawala.com in default email templates', () => {
      const html = renderPoojawalaEmail({
        statusBadge: 'OTP Verification',
        userName: 'Aarav',
        otpCode: '852963',
        emailMessage: 'Use your OTP code below to continue with your sacred journey on 1Pooja.',
        highlight: {
          title: 'Official Response',
          text: 'Thank you for reaching out.',
        },
      });

      // Platform brand checks
      expect(html).toContain('1Pooja');
      expect(html).toContain('852963');
      expect(html).toContain('support@1pooja.com');
      expect(html).toContain('https://1pooja.com');

      // Crucial: Must NOT contain unverified legacy domain
      expect(html).not.toContain('poojawala.com');
      expect(html).not.toContain('Poojawala Devotee Care Desk');
      expect(html).toContain('1Pooja Devotee Care Desk');
    });

    it('should respect custom websiteUrl and brand overrides without leaking undefined or malformed URLs', () => {
      const html = renderPoojawalaEmail({
        statusBadge: 'Welcome',
        userName: 'Priya',
        brandName: '1Pooja Divine',
        websiteUrl: 'https://custom.1pooja.com/',
        emailMessage: 'Welcome to our platform!',
      });

      expect(html).toContain('1Pooja Divine');
      // No double trailing slashes
      expect(html).toContain('href="https://custom.1pooja.com/privacy-policy"');
      expect(html).toContain('href="https://custom.1pooja.com/terms-and-conditions"');
      expect(html).toContain('href="https://custom.1pooja.com"');
      expect(html).not.toContain('undefined');
    });
  });

  describe('Configurable Platform Logo in Email Templates', () => {
    it('should render the default configured platform logo with correct dimensions and alt text', () => {
      const html = renderPoojawalaEmail({
        statusBadge: 'Booking Confirmed',
        userName: 'Aarav',
        emailMessage: 'Your sacred ritual is booked.',
      });

      expect(html).toContain('alt="1Pooja Logo"');
      expect(html).toContain('width="78" height="78"');
      expect(html).toContain('https://wv9qiathcc2z56f9.public.blob.vercel-storage.com/platform/1pooja-logo.png');
      expect(html).toContain('object-fit: contain');
      expect(html).not.toContain('<h1 style="margin: 0; font-size: 30px');
    });

    it('should render custom logoUrl when explicitly provided in options', () => {
      const customLogo = 'https://custom-storage.com/logos/partner-logo.png';
      const html = renderPoojawalaEmail({
        statusBadge: 'Welcome Devotee',
        userName: 'Aarav',
        emailMessage: 'Welcome to our platform.',
        logoUrl: customLogo,
      });

      expect(html).toContain(`src="${customLogo}"`);
      expect(html).toContain('alt="1Pooja Logo"');
      expect(html).toContain('width="78" height="78"');
    });

    it('should gracefully omit logo img when logoUrl is empty string without breaking email', () => {
      const html = renderPoojawalaEmail({
        statusBadge: 'Notice',
        userName: 'Aarav',
        emailMessage: 'Notice text.',
        logoUrl: '',
      });

      expect(html).not.toContain('<img src=""');
      expect(html).not.toContain('<!-- Configured Platform Brand Logo -->');
      expect(html).toContain('1Pooja');
      expect(html).toContain('Your Sacred pooja Partner');
    });
  });
});
