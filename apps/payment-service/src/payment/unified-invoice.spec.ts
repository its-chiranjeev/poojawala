// Must be the VERY FIRST statement — prevents Jest from crashing on puppeteer's ESM syntax
jest.mock('puppeteer', () => ({}));

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  paymentInvoiceTemplate,
  PaymentInvoiceTemplateData,
} from './templates/invoice.template';
import { PaymentService } from './payment.service';
import {
  User,
  USER_ROLE,
  Order,
  ORDER_STATUS,
  ORDER_PAYMENT_STATUS,
  ORDER_PAYMENT_METHOD,
  Booking,
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  Payment,
  PAYMENT_STATUS,
  CUSTOMER_PAYMENT_METHOD,
} from '@poojawala/entities';

describe('Unified Invoice System', () => {
  describe('paymentInvoiceTemplate', () => {
    const baseOrderData: PaymentInvoiceTemplateData = {
      invoiceType: 'ORDER',
      invoiceTitle: 'Poojawala Tax Invoice',
      invoiceId: 'INV-PW-ORD-2026-001',
      dateLabel: 'Payment Date',
      companyName: 'Poojawala Private Limited',
      companyEmail: 'support@poojawala.com',
      companyPhone: '+91 9876543210',
      companyAddress: '123 Temple Road, Varanasi, UP - 221001',
      companyGstin: '09AAACP1234A1Z5',
      customerName: 'Rahul Sharma',
      customerEmail: 'rahul.sharma@example.com',
      customerPhone: '+91 9123456780',
      billingAddress: 'Flat 402, Ganga Heights, Varanasi, UP - 221002',
      orderNumber: 'PW-ORD-2026-001',
      orderStatus: 'CONFIRMED',
      orderItems: [
        {
          productName: 'Pooja Thali Set',
          quantity: 2,
          unitPrice: 500,
          totalAmount: 1000,
        },
        {
          productName: 'Brass Diya Pack of 4',
          quantity: 1,
          unitPrice: 300,
          totalAmount: 300,
        },
      ],
      subtotal: '1300.00',
      discountAmount: '0.00',
      feeAmount: '0.00',
      taxAmount: '0.00',
      paymentId: 'pay_test123456',
      orderId: 'ORD-101',
      razorpayOrderId: 'order_test789012',
      paymentStatus: 'Paid',
      paymentMethod: 'UPI',
      statusClass: 'success',
      errorMessage: '-',
      currency: 'INR',
      amount: '1300.00',
      finalAmount: '1300.00',
      date: '24 Sep 2026, 11:30 AM',
    };

    it('should generate an Order invoice with correct Order details and items', () => {
      const html = paymentInvoiceTemplate(baseOrderData);

      // Order meta & header
      expect(html).toContain('INV-PW-ORD-2026-001');
      expect(html).toContain('PW-ORD-2026-001');
      expect(html).toContain('Order No.');
      expect(html).toContain('Devotional products order invoice');

      // Customer info
      expect(html).toContain('Rahul Sharma');
      expect(html).toContain('rahul.sharma@example.com');
      expect(html).toContain('+91 9123456780');
      expect(html).toContain('Flat 402, Ganga Heights, Varanasi, UP - 221002');

      // Order Summary
      expect(html).toContain('Order Summary');
      expect(html).toContain('Order ID');
      expect(html).toContain('ORD-101');
      expect(html).toContain('order_test789012');
      expect(html).toContain('Order Status');
      expect(html).toContain('Confirmed');

      // Booking specific fields must NOT appear
      expect(html).not.toContain('Booking Summary');
      expect(html).not.toContain('Assigned Purohit');
      expect(html).not.toContain('Booking No.');

      // Order Items
      expect(html).toContain('Pooja Thali Set');
      expect(html).toContain('Brass Diya Pack of 4');
      expect(html).toContain('500.00');
      expect(html).toContain('1000.00');
      expect(html).toContain('300.00');

      // Totals
      expect(html).toContain('Subtotal');
      expect(html).toContain('1300.00');
      expect(html).toContain('Total Paid Amount');
    });

    describe('Conditional charges display rules', () => {
      it('should hide tax, fee, and discount when they are 0/null/undefined', () => {
        const html = paymentInvoiceTemplate({
          ...baseOrderData,
          discountAmount: '0.00',
          feeAmount: '0.00',
          taxAmount: '0.00',
        });

        expect(html).not.toContain('Tax (GST)');
        expect(html).not.toContain('Delivery / Handling Fee');
        expect(html).not.toContain('Discount');
      });

      it('should show tax row when tax > 0, and hide when tax is 0 or undefined', () => {
        const withTax = paymentInvoiceTemplate({
          ...baseOrderData,
          taxAmount: '120.00',
          finalAmount: '1420.00',
        });
        expect(withTax).toContain('Tax (GST)');
        expect(withTax).toContain('120.00');

        const withoutTax = paymentInvoiceTemplate({
          ...baseOrderData,
          taxAmount: undefined,
        });
        expect(withoutTax).not.toContain('Tax (GST)');
      });

      it('should show fee row when fee > 0, and hide when fee is 0 or undefined', () => {
        const withFee = paymentInvoiceTemplate({
          ...baseOrderData,
          feeAmount: '50.00',
          finalAmount: '1350.00',
        });
        expect(withFee).toContain('Delivery / Handling Fee');
        expect(withFee).toContain('50.00');

        const withoutFee = paymentInvoiceTemplate({
          ...baseOrderData,
          feeAmount: '0.00',
        });
        expect(withoutFee).not.toContain('Delivery / Handling Fee');
      });

      it('should show discount row as negative deduction when discount > 0, and hide when discount is 0', () => {
        const withDiscount = paymentInvoiceTemplate({
          ...baseOrderData,
          subtotal: '1500.00',
          discountAmount: '200.00',
          couponCode: 'FESTIVE200',
          finalAmount: '1300.00',
        });
        expect(withDiscount).toContain('Discount');
        expect(withDiscount).toContain('(FESTIVE200)');
        expect(withDiscount).toContain('negative');
        expect(withDiscount).toContain('200.00');

        const withoutDiscount = paymentInvoiceTemplate({
          ...baseOrderData,
          discountAmount: '0',
        });
        expect(withoutDiscount).not.toContain('Discount');
      });
    });

    describe('Proforma vs Tax Invoice', () => {
      it('should render Proforma Invoice for unpaid orders', () => {
        const html = paymentInvoiceTemplate({
          ...baseOrderData,
          invoiceTitle: 'Poojawala Proforma Invoice',
          invoiceId: 'PROFORMA-PW-ORD-2026-001',
          dateLabel: 'Order Date',
          paymentStatus: 'Pending',
          statusClass: 'pending',
          amount: '0.00',
        });

        expect(html).toContain('Proforma Invoice');
        expect(html).toContain('PROFORMA-PW-ORD-2026-001');
        expect(html).toContain('Amount Due');
        expect(html).toContain('Payment confirmation is pending.');
        expect(html).toContain('Proforma notice:');
        expect(html).toContain('Total Payable Amount');
      });

      it('should render Tax Invoice for paid orders', () => {
        const html = paymentInvoiceTemplate({
          ...baseOrderData,
          invoiceTitle: 'Poojawala Tax Invoice',
          invoiceId: 'INV-PW-ORD-2026-001',
          dateLabel: 'Payment Date',
          paymentStatus: 'Paid',
          statusClass: 'success',
        });

        expect(html).toContain('Tax Invoice');
        expect(html).toContain('INV-PW-ORD-2026-001');
        expect(html).toContain('Amount Paid');
        expect(html).toContain('Total Paid Amount');
        expect(html).toContain('Payment received successfully.');
        expect(html).toContain('This is a system-generated tax invoice for the\n              successfully recorded order payment.');
      });
    });

    describe('Booking invoice backward compatibility regression', () => {
      it('should render standard Booking invoice identically with Booking details', () => {
        const bookingData: PaymentInvoiceTemplateData = {
          invoiceType: 'BOOKING',
          invoiceTitle: 'Poojawala Tax Invoice',
          invoiceId: 'INV-PW-BK-1001',
          dateLabel: 'Payment Date',
          companyName: 'Poojawala',
          companyEmail: 'support@poojawala.com',
          companyPhone: '+91 9876543210',
          companyAddress: 'Varanasi',
          companyGstin: '09AAACP1234A1Z5',
          customerName: 'Suresh Kumar',
          customerEmail: 'suresh@example.com',
          customerPhone: '+91 9999988888',
          billingAddress: 'Ghat Road, Varanasi',
          bookingId: 101,
          bookingNumber: 'PW-BK-1001',
          bookingStatus: 'COMPLETED',
          serviceName: 'Satyanarayan Katha',
          purohitName: 'Pt. Ramesh Shastri',
          paymentId: 'pay_bk_123',
          orderId: 'order_bk_456',
          paymentStatus: 'Paid',
          paymentMethod: 'UPI',
          statusClass: 'success',
          errorMessage: '-',
          currency: 'INR',
          amount: '2100.00',
          finalAmount: '2100.00',
          donationAmount: '100.00',
          discountAmount: '0.00',
          date: '24 Sep 2026, 10:00 AM',
        };

        const html = paymentInvoiceTemplate(bookingData);

        expect(html).toContain('INV-PW-BK-1001');
        expect(html).toContain('Booking No.');
        expect(html).toContain('Sacred ritual booking invoice');
        expect(html).toContain('Booking Summary');
        expect(html).toContain('Booking Type');
        expect(html).toContain('Pooja');
        expect(html).toContain('Satyanarayan Katha');
        expect(html).toContain('Assigned Purohit');
        expect(html).toContain('Pt. Ramesh Shastri');
        expect(html).toContain('Voluntary donation');
        expect(html).not.toContain('Order Summary');
        expect(html).not.toContain('Assigned Astrologer');
      });

      it('should render Astrology booking invoice with Astrology Platform Access Fee, Total Paid to Poojawala, disclaimer, and no Remaining Balance', () => {
        const astrologyData: PaymentInvoiceTemplateData = {
          invoiceType: 'BOOKING',
          bookingType: 'ASTROLOGY',
          invoiceTitle: 'Poojawala Tax Invoice',
          invoiceId: 'INV-PW-ASTRO-2001',
          dateLabel: 'Payment Date',
          companyName: 'Poojawala',
          companyEmail: 'support@poojawala.com',
          companyPhone: '+91 9876543210',
          companyAddress: 'Varanasi',
          companyGstin: '09AAACP1234A1Z5',
          customerName: 'Suresh Kumar',
          customerEmail: 'suresh@example.com',
          customerPhone: '+91 9999988888',
          billingAddress: 'Ghat Road, Varanasi',
          bookingId: 202,
          bookingNumber: 'PW-ASTRO-2001',
          bookingStatus: 'ACCEPTED',
          serviceName: 'Astrology Platform Access',
          astrologerName: 'Acharya Vidyadhar',
          paymentId: 'pay_astro_123',
          orderId: 'order_astro_456',
          paymentStatus: 'Paid',
          paymentMethod: 'UPI',
          statusClass: 'success',
          errorMessage: '-',
          currency: 'INR',
          amount: '50.00',
          finalAmount: '50.00',
          paidAmount: '50.00',
          remainingAmount: '0.00',
          donationAmount: '0.00',
          discountAmount: '0.00',
          date: '25 Sep 2026, 11:00 AM',
        };

        const html = paymentInvoiceTemplate(astrologyData);

        expect(html).toContain('INV-PW-ASTRO-2001');
        expect(html).toContain('Booking Summary');
        expect(html).toContain('Booking Type');
        expect(html).toContain('Astrology');
        expect(html).toContain('Assigned Astrologer');
        expect(html).toContain('Acharya Vidyadhar');
        expect(html).toContain('Astrology Platform Access Fee');
        expect(html).toContain('Total Paid to 1Pooja');
        expect(html).toContain(
          'The amount paid to 1Pooja covers the astrology platform access fee only. Astrology consultation charges are separate and payable directly to the assigned astrologer at their applicable per-minute rate. 1Pooja does not collect these consultation charges.',
        );
        expect(html).toContain('Important: Consultation Charges');
        expect(html).not.toContain('Remaining Balance');
        expect(html).not.toContain('service charge');
        expect(html).not.toContain('Assigned Purohit');
        expect(html).not.toContain('Order Summary');
      });
    });
  });

  describe('PaymentService invoice methods', () => {
    let service: PaymentService;
    let mockOrderRepo: any;
    let mockPaymentRepo: any;
    let mockBookingRepo: any;
    let mockDataSource: any;

    const mockAdminUser: User = {
      id: 1,
      role: USER_ROLE.ADMIN,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@poojawala.com',
    } as any;

    const mockCustomerUser: User = {
      id: 10,
      role: USER_ROLE.CUSTOMER,
      firstName: 'Amit',
      lastName: 'Patel',
      email: 'amit@example.com',
      phone: '9876543210',
    } as any;

    const mockOtherCustomerUser: User = {
      id: 20,
      role: USER_ROLE.CUSTOMER,
      firstName: 'Other',
      lastName: 'Customer',
      email: 'other@example.com',
    } as any;

    const sampleOrder: Order = {
      id: 501,
      orderNumber: 'PW-ORD-123456-7890',
      customerId: 10,
      customer: mockCustomerUser,
      subtotal: 1300,
      discountAmount: 0,
      totalAmount: 1300,
      paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      orderStatus: ORDER_STATUS.CONFIRMED,
      shippingAddressSnapshot: {
        name: 'Amit Patel',
        phone: '9876543210',
        addressLine1: 'B-12, Shanti Nagar',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        pincode: '221005',
      },
      items: [
        {
          id: 1,
          orderId: 501,
          productNameSnapshot: 'Gangajal 500ml',
          unitPriceSnapshot: 150,
          quantity: 2,
          totalAmount: 300,
        },
        {
          id: 2,
          orderId: 501,
          productNameSnapshot: 'Havan Samagri 1kg',
          unitPriceSnapshot: 1000,
          quantity: 1,
          totalAmount: 1000,
        },
      ] as any,
      paymentId: 901,
      payment: {
        id: 901,
        amount: 1300,
        currency: 'INR',
        paymentMethod: 'UPI',
        customerPaymentMethod: CUSTOMER_PAYMENT_METHOD.ONLINE,
        razorpayPaymentId: 'pay_razor123',
        razorpayOrderId: 'order_razor456',
        status: PAYMENT_STATUS.SUCCESS,
        paidAt: new Date('2026-09-24T10:00:00Z'),
      } as any,
      createdAt: new Date('2026-09-24T09:30:00Z'),
      updatedAt: new Date('2026-09-24T10:00:00Z'),
    } as any;

    beforeEach(() => {
      mockOrderRepo = {
        findOne: jest.fn(),
      };
      mockPaymentRepo = {
        findOne: jest.fn(),
        findLatestByBookingId: jest.fn(),
      };
      mockBookingRepo = {
        findBookingById: jest.fn(),
        findOne: jest.fn(),
      };
      mockDataSource = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === Order) return mockOrderRepo;
          if (entity === Payment) return mockPaymentRepo;
          return {};
        }),
      };

      process.env['RAZORPAY_KEY_ID'] = 'rzp_test_dummy';
      process.env['RAZORPAY_KEY_SECRET'] = 'rzp_secret_dummy';

      service = new PaymentService(
        mockBookingRepo,
        mockPaymentRepo,
        mockDataSource,
        { createNotification: jest.fn(), notifyAdmins: jest.fn() } as any,
        {} as any,
        { createAuditLog: jest.fn() } as any,
      );

      // Mock renderHtmlToPdf so tests don't require launching headless Chromium in unit tests
      jest.spyOn<any, any>(service, 'renderHtmlToPdf').mockImplementation(
        async (html: string, filename: string) => {
          return {
            buffer: Buffer.from(html),
            filename,
          };
        },
      );
    });

    it('should successfully generate an order invoice for the customer who owns it', async () => {
      mockOrderRepo.findOne.mockResolvedValue(sampleOrder);

      const result = await service.generateOrderInvoicePdf(mockCustomerUser, 501);

      expect(result).toBeDefined();
      expect(result.filename).toBe('invoice-PW-ORD-123456-7890.pdf');
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('PW-ORD-123456-7890');
      expect(renderedHtml).toContain('Gangajal 500ml');
      expect(renderedHtml).toContain('Havan Samagri 1kg');
      expect(renderedHtml).toContain('ORD-501');
      expect(renderedHtml).toContain('order_razor456');
      expect(renderedHtml).toContain('1300.00');
    });

    it('should allow an admin to generate any customer order invoice', async () => {
      mockOrderRepo.findOne.mockResolvedValue(sampleOrder);

      const result = await service.generateOrderInvoicePdf(mockAdminUser, 501);

      expect(result).toBeDefined();
      expect(result.filename).toBe('invoice-PW-ORD-123456-7890.pdf');
    });

    it('should throw ForbiddenException when a customer attempts to access another customer order invoice', async () => {
      mockOrderRepo.findOne.mockResolvedValue(sampleOrder);

      await expect(
        service.generateOrderInvoicePdf(mockOtherCustomerUser, 501),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generateOrderInvoicePdf(mockCustomerUser, 9999),
      ).rejects.toThrow(NotFoundException);
    });

    it('should generate a Proforma Invoice for unpaid order', async () => {
      const unpaidOrder = {
        ...sampleOrder,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
      };
      mockOrderRepo.findOne.mockResolvedValue(unpaidOrder);

      const result = await service.generateOrderInvoicePdf(mockCustomerUser, 501);
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Proforma Invoice');
      expect(renderedHtml).toContain('PROFORMA-PW-ORD-123456-7890');
      expect(renderedHtml).not.toContain('INV-PW-ORD-123456-7890');
    });

    it('should generate a Proforma Invoice for unpaid COD order and Paid Tax Invoice only after COD payment collection', async () => {
      const codPendingOrder = {
        ...sampleOrder,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
        paymentStatus: ORDER_PAYMENT_STATUS.COD_PENDING,
        orderStatus: ORDER_STATUS.CONFIRMED,
      };
      mockOrderRepo.findOne.mockResolvedValue(codPendingOrder);

      // 1. Before collection: Proforma
      const proformaResult = await service.generateOrderInvoicePdf(mockCustomerUser, 501);
      const proformaHtml = proformaResult.buffer.toString();
      expect(proformaHtml).toContain('Proforma Invoice');
      expect(proformaHtml).toContain('PROFORMA-PW-ORD-123456-7890');
      expect(proformaHtml).toContain('Cash on Delivery (COD)');
      expect(proformaHtml).toContain('COD Pending');

      // 2. After collection: Paid Tax Invoice
      const codPaidOrder = {
        ...codPendingOrder,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      };
      mockOrderRepo.findOne.mockResolvedValue(codPaidOrder);

      const paidResult = await service.generateOrderInvoicePdf(mockCustomerUser, 501);
      const paidHtml = paidResult.buffer.toString();
      expect(paidHtml).toContain('Tax Invoice');
      expect(paidHtml).toContain('INV-PW-ORD-123456-7890');
      expect(paidHtml).toContain('Cash on Delivery (COD)');
      expect(paidHtml).toContain('Paid');
    });

    it('should maintain backward compatibility with existing Booking generateInvoicePdf', async () => {
      const sampleBooking: Booking = {
        id: 201,
        bookingNumber: 'PW-BK-9999',
        customerId: 10,
        customer: mockCustomerUser,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        finalAmount: 1500,
        donationAmount: 0,
        discountAmount: 0,
        service: { name: 'Ganesh Puja' } as any,
        customerAddress: {
          addressLine1: 'Ghat Road',
          city: 'Varanasi',
        } as any,
      } as any;

      mockBookingRepo.findBookingById.mockResolvedValue(sampleBooking);
      mockPaymentRepo.findLatestByBookingId.mockResolvedValue({
        id: 88,
        amount: 1500,
        paymentMethod: 'UPI',
        status: PAYMENT_STATUS.SUCCESS,
        paidAt: new Date(),
      });

      const result = await service.generateInvoicePdf(mockCustomerUser, 201);
      expect(result).toBeDefined();
      expect(result.filename).toBe('invoice-PW-BK-9999.pdf');
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Booking Summary');
      expect(renderedHtml).toContain('PW-BK-9999');
      expect(renderedHtml).toContain('Ganesh Puja');
    });

    it('should display razorpayFee, razorpayTax, and customerPaidAmount in Order invoice PDF when customer paid more than order price', async () => {
      const orderWithFees = {
        id: 502,
        orderNumber: 'PW-ORD-FEES-1234',
        customerId: 10,
        customer: mockCustomerUser,
        totalAmount: 525,
        subtotal: 525,
        discountAmount: 0,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
        orderStatus: ORDER_STATUS.CONFIRMED,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        payment: {
          id: 99,
          amount: 540.71,
          customerPaidAmount: 540.71,
          razorpayFee: 13.63,
          razorpayTax: 2.08,
          paymentMethod: 'UPI',
          status: PAYMENT_STATUS.SUCCESS,
          paidAt: new Date(),
        },
        items: [
          {
            productNameSnapshot: 'Puja Samagri Kit',
            quantity: 1,
            unitPriceSnapshot: 525,
            totalAmount: 525,
          },
        ],
        shippingAddressSnapshot: {
          name: 'Rahul Sharma',
          phone: '9123456780',
          addressLine1: 'Ganga Ghat',
          city: 'Varanasi',
          pincode: '221001',
        },
      };
      mockOrderRepo.findOne.mockResolvedValue(orderWithFees);

      const result = await service.generateOrderInvoicePdf(mockCustomerUser, 502);
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Customer Paid Amount');
      expect(renderedHtml).toContain('540.71');
      expect(renderedHtml).toContain('Razorpay Fee');
      expect(renderedHtml).toContain('13.63');
      expect(renderedHtml).not.toContain('Razorpay Tax');
    });

    it('should NOT display razorpayFee and razorpayTax when customer paid amount is equal to order price', async () => {
      const orderEqualPrice = {
        id: 503,
        orderNumber: 'PW-ORD-EQUAL-1234',
        customerId: 10,
        customer: mockCustomerUser,
        totalAmount: 525,
        subtotal: 525,
        discountAmount: 0,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
        orderStatus: ORDER_STATUS.CONFIRMED,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        payment: {
          id: 100,
          amount: 525,
          customerPaidAmount: 525.0,
          razorpayFee: 13.63,
          razorpayTax: 2.08,
          paymentMethod: 'UPI',
          status: PAYMENT_STATUS.SUCCESS,
          paidAt: new Date(),
        },
        items: [
          {
            productNameSnapshot: 'Puja Samagri Kit',
            quantity: 1,
            unitPriceSnapshot: 525,
            totalAmount: 525,
          },
        ],
        shippingAddressSnapshot: {
          name: 'Rahul Sharma',
          phone: '9123456780',
          addressLine1: 'Ganga Ghat',
          city: 'Varanasi',
          pincode: '221001',
        },
      };
      mockOrderRepo.findOne.mockResolvedValue(orderEqualPrice);

      const result = await service.generateOrderInvoicePdf(mockCustomerUser, 503);
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Customer Paid Amount');
      expect(renderedHtml).toContain('525.00');
      expect(renderedHtml).not.toContain('Razorpay Fee');
      expect(renderedHtml).not.toContain('Razorpay Tax');
    });

    it('should display razorpayFee, razorpayTax, and customerPaidAmount in Booking invoice PDF when customer paid more than booking price', async () => {
      const bookingWithFees: Booking = {
        id: 202,
        bookingNumber: 'PW-BK-FEES-5555',
        customerId: 10,
        customer: mockCustomerUser,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        finalAmount: 525,
        donationAmount: 0,
        discountAmount: 0,
        service: { name: 'Maha Aarti' } as any,
        customerAddress: {
          addressLine1: 'Assi Ghat',
          city: 'Varanasi',
        } as any,
      } as any;

      mockBookingRepo.findBookingById.mockResolvedValue(bookingWithFees);
      mockPaymentRepo.findLatestByBookingId.mockResolvedValue({
        id: 100,
        amount: 540.71,
        customerPaidAmount: 540.71,
        razorpayFee: 13.63,
        razorpayTax: 2.08,
        paymentMethod: 'CARD',
        status: PAYMENT_STATUS.SUCCESS,
        paidAt: new Date(),
      });

      const result = await service.generateInvoicePdf(mockCustomerUser, 202);
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Customer Paid Amount');
      expect(renderedHtml).toContain('540.71');
      expect(renderedHtml).toContain('Razorpay Fee');
      expect(renderedHtml).toContain('13.63');
      expect(renderedHtml).not.toContain('Razorpay Tax');
    });

    it('should NOT display razorpayFee and razorpayTax in Booking invoice PDF when customer paid amount is equal to booking price', async () => {
      const bookingEqualPrice: Booking = {
        id: 203,
        bookingNumber: 'PW-BK-EQUAL-5555',
        customerId: 10,
        customer: mockCustomerUser,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        finalAmount: 525,
        donationAmount: 0,
        discountAmount: 0,
        service: { name: 'Maha Aarti' } as any,
        customerAddress: {
          addressLine1: 'Assi Ghat',
          city: 'Varanasi',
        } as any,
      } as any;

      mockBookingRepo.findBookingById.mockResolvedValue(bookingEqualPrice);
      mockPaymentRepo.findLatestByBookingId.mockResolvedValue({
        id: 101,
        amount: 525,
        customerPaidAmount: 525.0,
        razorpayFee: 13.63,
        razorpayTax: 2.08,
        paymentMethod: 'CARD',
        status: PAYMENT_STATUS.SUCCESS,
        paidAt: new Date(),
      });

      const result = await service.generateInvoicePdf(mockCustomerUser, 203);
      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Customer Paid Amount');
      expect(renderedHtml).toContain('525.00');
      expect(renderedHtml).not.toContain('Razorpay Fee');
      expect(renderedHtml).not.toContain('Razorpay Tax');
    });

    it('should allow astrologer to download invoice for their astrology booking and render Assigned Astrologer', async () => {
      const mockAstrologerUser: User = {
        id: 77,
        role: USER_ROLE.ASTROLOGER,
        firstName: 'Acharya',
        lastName: 'Vidyadhar',
        email: 'astrologer@example.com',
      } as any;

      const astrologyBooking = {
        id: 301,
        bookingNumber: 'PW-ASTRO-9999',
        bookingType: 'ASTROLOGY',
        customerId: 10,
        astrologerId: 77,
        customer: mockCustomerUser,
        astrologer: mockAstrologerUser,
        status: BOOKING_STATUS.ACCEPTED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        finalAmount: 50,
        paidAmount: 50,
        donationAmount: 0,
        discountAmount: 0,
        customerAddress: {
          addressLine1: 'Ganga Ghat',
          city: 'Varanasi',
        } as any,
      } as any;

      mockBookingRepo.findBookingById.mockResolvedValue(astrologyBooking);
      mockPaymentRepo.findLatestByBookingId.mockResolvedValue({
        id: 150,
        amount: 50,
        paymentMethod: 'UPI',
        status: PAYMENT_STATUS.SUCCESS,
        paidAt: new Date(),
      });

      const result = await service.generateInvoicePdf(mockAstrologerUser, 301);
      expect(result).toBeDefined();
      expect(result.filename).toBe('invoice-PW-ASTRO-9999.pdf');

      const renderedHtml = result.buffer.toString();
      expect(renderedHtml).toContain('Booking Summary');
      expect(renderedHtml).toContain('PW-ASTRO-9999');
      expect(renderedHtml).toContain('Booking Type');
      expect(renderedHtml).toContain('Astrology');
      expect(renderedHtml).toContain('Assigned Astrologer');
      expect(renderedHtml).toContain('Acharya Vidyadhar');
      expect(renderedHtml).toContain('Astrology Platform Access Fee');
      expect(renderedHtml).toContain('Total Paid to 1Pooja');
      expect(renderedHtml).toContain(
        'The amount paid to 1Pooja covers the astrology platform access fee only',
      );
      expect(renderedHtml).not.toContain('Remaining Balance');
      expect(renderedHtml).not.toContain('Assigned Purohit');
    });

    it('should protect astrologer identity in invoice before payment is verified for customer', async () => {
      const mockAstrologerUser: User = {
        id: 77,
        role: USER_ROLE.ASTROLOGER,
        firstName: 'Acharya',
        lastName: 'Vidyadhar',
        email: 'astrologer@example.com',
      } as any;

      const unpaidAstrologyBooking = {
        id: 302,
        bookingNumber: 'PW-ASTRO-UNPAID',
        bookingType: 'ASTROLOGY',
        customerId: 10,
        astrologerId: 77,
        customer: mockCustomerUser,
        astrologer: mockAstrologerUser,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        finalAmount: 50,
        paidAmount: 0,
        donationAmount: 0,
        discountAmount: 0,
        customerAddress: {
          addressLine1: 'Ganga Ghat',
          city: 'Varanasi',
        } as any,
      } as any;

      mockBookingRepo.findBookingById.mockResolvedValue(unpaidAstrologyBooking);
      mockPaymentRepo.findLatestByBookingId.mockResolvedValue(null);

      const result = await service.generateInvoicePdf(mockCustomerUser, 302);
      const renderedHtml = result.buffer.toString();

      expect(renderedHtml).toContain('Available after payment confirmation');
      expect(renderedHtml).not.toContain('Acharya Vidyadhar');
    });

    it('should throw ForbiddenException if another customer tries to download astrology invoice', async () => {
      const astrologyBooking = {
        id: 303,
        bookingNumber: 'PW-ASTRO-OTHER',
        bookingType: 'ASTROLOGY',
        customerId: 10,
        astrologerId: 77,
      } as any;

      mockBookingRepo.findBookingById.mockResolvedValue(astrologyBooking);

      await expect(
        service.generateInvoicePdf(mockOtherCustomerUser, 303),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should render invoice correctly with dynamic fee (e.g. ₹120) and not hardcode ₹50', () => {
      const dynamicFeeData: PaymentInvoiceTemplateData = {
        invoiceType: 'BOOKING',
        bookingType: 'ASTROLOGY',
        invoiceTitle: 'Poojawala Tax Invoice',
        invoiceId: 'INV-PW-ASTRO-DYNAMIC',
        dateLabel: 'Payment Date',
        companyName: 'Poojawala',
        companyEmail: 'support@poojawala.com',
        customerName: 'Aarav Patel',
        bookingId: 401,
        bookingNumber: 'PW-ASTRO-DYN-01',
        bookingStatus: 'ACCEPTED',
        serviceName: 'Astrology Platform Access',
        astrologerName: 'Pandit Shastri',
        paymentId: 'pay_dyn_123',
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
        statusClass: 'success',
        currency: 'INR',
        amount: '120.00',
        finalAmount: '120.00',
        paidAmount: '120.00',
      };

      const html = paymentInvoiceTemplate(dynamicFeeData);
      expect(html).toContain('INR 120.00');
      expect(html).toContain('Total Paid to 1Pooja');
      expect(html).toContain('Astrology Platform Access Fee');
      expect(html).not.toContain('INR 50.00');
      expect(html).toContain('Important: Consultation Charges');
      expect(html).not.toContain('Remaining Balance');
    });

    it('should handle extremely long customer name and address without breaking layout', () => {
      const longName =
        'VeryLongCustomerNameThatExceedsNormalLengthWithoutSpacesToTestWrappingAndLayoutSafety1234567890';
      const longAddress =
        'House No 999, Ultra Extended Complex Name, Behind Ancient Heritage Site, Very Long Street Name That Keeps Going On And On, Varanasi, Uttar Pradesh, 221001, India';

      const data: PaymentInvoiceTemplateData = {
        invoiceType: 'BOOKING',
        bookingType: 'ASTROLOGY',
        invoiceTitle: 'Poojawala Tax Invoice',
        invoiceId: 'INV-PW-ASTRO-LONG',
        customerName: longName,
        billingAddress: longAddress,
        bookingId: 402,
        bookingNumber: 'PW-ASTRO-LONG-01',
        serviceName: 'Astrology Platform Access',
        astrologerName: 'Acharya Vidyadhar',
        paymentStatus: 'Paid',
        statusClass: 'success',
        currency: 'INR',
        amount: '75.00',
        finalAmount: '75.00',
      };

      const html = paymentInvoiceTemplate(data);
      expect(html).toContain(longName);
      expect(html).toContain(longAddress);
      expect(html).toContain('Astrology Platform Access Fee');
      expect(html).toContain('Total Paid to 1Pooja');
    });

    it('should use 1Pooja branding in footer, notice, logo alt, and resolve websiteUrl from .env', () => {
      const prevFrontendUrl = process.env['FRONTEND_URL'];
      process.env['FRONTEND_URL'] = 'https://custom-1pooja-env.com/';

      try {
        const data: PaymentInvoiceTemplateData = {
          invoiceType: 'BOOKING',
          bookingType: 'ASTROLOGY',
          invoiceTitle: 'Tax Invoice',
          invoiceId: 'INV-BRAND-01',
          customerName: 'Rohit Verma',
          companyName: '1Pooja',
          logoUrl: 'https://custom-1pooja-env.com/logo.png',
          bookingId: 900,
          bookingNumber: 'PW-ASTRO-900',
          serviceName: 'Astrology Platform Access',
          paymentStatus: 'Paid',
          statusClass: 'success',
          currency: 'INR',
          amount: '50.00',
          finalAmount: '50.00',
        };

        const html = paymentInvoiceTemplate(data);
        expect(html).toContain('alt="1Pooja Logo"');
        expect(html).toContain('Total Paid to 1Pooja');
        expect(html).toContain('Thank you for choosing 1Pooja.');
        expect(html).toContain('The amount paid to 1Pooja covers the astrology platform access fee only');
        expect(html).toContain('1Pooja does not collect these consultation charges.');
        expect(html).toContain('https://custom-1pooja-env.com');
        expect(html).toMatch(/<strong>Website:<\/strong>\s+https:\/\/custom-1pooja-env\.com/);
        expect(html).not.toContain('poojawala.com');
      } finally {
        if (prevFrontendUrl !== undefined) {
          process.env['FRONTEND_URL'] = prevFrontendUrl;
        } else {
          delete process.env['FRONTEND_URL'];
        }
      }
    });

    const testInvoiceData: PaymentInvoiceTemplateData = {
      invoiceTitle: '1Pooja Tax Invoice',
      invoiceId: 'INV-TEST-001',
      dateLabel: 'Payment Date',
      companyName: '1Pooja',
      companyEmail: 'support@1pooja.com',
      companyPhone: '+91 9999999999',
      companyAddress: 'Varanasi',
      companyGstin: '09AAACH7409R1ZZ',
      customerName: 'Devotee',
      customerEmail: 'devotee@example.com',
      customerPhone: '+91 9123456780',
      billingAddress: 'Varanasi',
      paymentId: 'pay_123',
      orderId: 'ORD-1',
      paymentStatus: 'Paid',
      paymentMethod: 'UPI',
      statusClass: 'success',
      errorMessage: '-',
      currency: 'INR',
      amount: '500.00',
      finalAmount: '500.00',
      date: '24 Sep 2026, 11:30 AM',
    };

    it('should dynamically render default platform logo when logoUrl is omitted', () => {
      const html = paymentInvoiceTemplate(testInvoiceData);
      expect(html).toContain('class="brand-logo-image"');
      expect(html).toContain('alt="1Pooja Logo"');
      expect(html).toContain('https://wv9qiathcc2z56f9.public.blob.vercel-storage.com/platform/1pooja-logo.png');
      expect(html).toContain('width: 80px');
      expect(html).toContain('height: 80px');
      // Duplicate 1Pooja h1 should not be rendered when logo image is present
      expect(html).not.toMatch(/<div class="brand-copy">\s*<h1>/);
    });

    it('should render custom logo when explicit logoUrl is provided', () => {
      const html = paymentInvoiceTemplate({
        ...testInvoiceData,
        logoUrl: 'https://cdn.example.com/custom-brand-logo.png',
      });
      expect(html).toContain('class="brand-logo-image"');
      expect(html).toContain('src="https://cdn.example.com/custom-brand-logo.png"');
      expect(html).toContain('alt="1Pooja Logo"');
      expect(html).not.toMatch(/<div class="brand-copy">\s*<h1>/);
    });

    it('should fall back gracefully to Om symbol when logoUrl is empty or missing without broken img tag', () => {
      const html = paymentInvoiceTemplate({
        ...testInvoiceData,
        logoUrl: '',
      });
      expect(html).toContain('class="brand-symbol"');
      expect(html).toContain('ॐ');
      expect(html).not.toContain('class="brand-logo-image"');
      // Falls back to showing companyName h1
      expect(html).toMatch(/<div class="brand-copy">\s*<h1>\s*1Pooja\s*<\/h1>/);
    });
  });

  describe('Astrology Transparency Utilities & Payment Disclosures', () => {
    it('should build pre-payment disclosure with per-minute rate when available', () => {
      const { buildAstrologyTransparencyNotices } = require('@poojawala/common');
      const notices = buildAstrologyTransparencyNotices(50, 25, false);

      expect(notices.platformAccessFee).toBe(50);
      expect(notices.ratePerMinute).toBe(25);
      expect(notices.isUnlocked).toBe(false);
      expect(notices.consultationChargesNoticeTitle).toBe('Astrology Consultation Charges');
      expect(notices.consultationFeeNotice).toContain('Pay ₹50 to unlock the astrologer\'s details');
      expect(notices.consultationFeeNotice).toContain('rate of ₹25/min');
      expect(notices.consultationDirectBillingNotice).toBeNull();
    });

    it('should build pre-payment disclosure without fabricating rate when rate is null/undefined', () => {
      const { buildAstrologyTransparencyNotices } = require('@poojawala/common');
      const notices = buildAstrologyTransparencyNotices(75, null, false);

      expect(notices.platformAccessFee).toBe(75);
      expect(notices.ratePerMinute).toBeNull();
      expect(notices.isUnlocked).toBe(false);
      expect(notices.consultationFeeNotice).toContain('Pay ₹75 to unlock the astrologer\'s details');
      expect(notices.consultationFeeNotice).toContain('Please confirm the rate with the astrologer before starting');
      expect(notices.consultationFeeNotice).not.toContain('undefined');
      expect(notices.consultationFeeNotice).not.toContain('null');
    });

    it('should build unlocked astrologer details disclosure explaining direct billing', () => {
      const { buildAstrologyTransparencyNotices } = require('@poojawala/common');
      const notices = buildAstrologyTransparencyNotices(50, 30, true);

      expect(notices.isUnlocked).toBe(true);
      expect(notices.consultationChargesNoticeTitle).toBe('Direct Astrologer Billing');
      expect(notices.consultationDirectBillingNotice).toContain(
        'Consultation charges (₹30/min) are separate from the Poojawala platform access fee',
      );
      expect(notices.consultationDirectBillingNotice).toContain(
        'Payment for the consultation is made directly to the astrologer, not through Poojawala',
      );
    });

    it('should build unlocked disclosure without rate when rate is unavailable', () => {
      const { buildAstrologyTransparencyNotices } = require('@poojawala/common');
      const notices = buildAstrologyTransparencyNotices(50, undefined, true);

      expect(notices.ratePerMinute).toBeNull();
      expect(notices.consultationDirectBillingNotice).toContain(
        'Consultation charges are separate from the Poojawala platform access fee',
      );
      expect(notices.consultationDirectBillingNotice).toContain(
        'Please confirm the applicable per-minute rate with the astrologer',
      );
    });
  });
});
