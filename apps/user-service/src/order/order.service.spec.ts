// Must be the VERY FIRST statement — prevents Jest from crashing on
// puppeteer's ESM syntax when transitively imported via cart.service → payment.service.
jest.mock('puppeteer', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderService } from './order.service';
import { OrderRepository } from '@poojawala/repositories';
import {
  Order,
  OrderItem,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  Payment,
  PAYMENT_STATUS,
  User,
  USER_ROLE,
  USER_STATUS,
} from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { NotificationService } from '@poojawala/notification';
import { EmailService } from '@poojawala/email-services';

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeOnlineOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 101,
    orderNumber: 'PW-ORD-123456-7890',
    customerId: 1,
    subtotal: 500,
    discountAmount: 0,
    totalAmount: 500,
    paymentId: 301,
    paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
    paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    orderStatus: ORDER_STATUS.PENDING_PAYMENT,
    expiredAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
    shippingAddressSnapshot: {
      name: 'Devotee Sharma',
      phone: '9876543210',
      addressLine1: '123 Temple Road',
      city: 'Varanasi',
      pincode: '221001',
    },
    items: [] as OrderItem[],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Order);

const makeCodOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 202,
    orderNumber: 'PW-ORD-654321-1234',
    customerId: 1,
    subtotal: 300,
    discountAmount: 0,
    totalAmount: 300,
    paymentId: 401,
    paymentMethod: ORDER_PAYMENT_METHOD.COD,
    paymentStatus: ORDER_PAYMENT_STATUS.COD_PENDING,
    orderStatus: ORDER_STATUS.CONFIRMED,
    expiredAt: null,
    shippingAddressSnapshot: {
      name: 'Devotee Sharma',
      phone: '9876543210',
      addressLine1: '123 Temple Road',
      city: 'Varanasi',
      pincode: '221001',
    },
    items: [] as OrderItem[],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Order);

// ─── test suite ───────────────────────────────────────────────────────────────

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let dataSource: jest.Mocked<DataSource>;
  let mockOrderRepo: {
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
    execute: jest.Mock;
  };

  const customerUser: User = {
    id: 1,
    username: 'testcustomer',
    firstName: 'Devotee',
    lastName: 'Sharma',
    email: 'devotee@example.com',
    phone: '9876543210',
    role: USER_ROLE.CUSTOMER,
    status: USER_STATUS.ACTIVE,
    hashedPassword: 'hash',
    tokenVersion: 1,
    isAdminCreated: false,
    addresses: [],
    favorites: [],
    bookings: [],
    serviceAreas: [],
    avgRating: 5.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: User = {
    ...customerUser,
    id: 99,
    username: 'adminuser',
    role: USER_ROLE.ADMIN,
  };

  const mockPayment: Payment = {
    id: 301,
    amount: 500,
    status: PAYMENT_STATUS.PENDING,
  } as unknown as Payment;

  let mockAuditLogService: { createAuditLog: jest.Mock };
  let mockNotificationService: {
    createNotification: jest.Mock;
    notifyAdmins: jest.Mock;
  };
  let mockEmailService: { sendMail: jest.Mock };

  beforeEach(async () => {
    mockOrderRepo = {
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      execute: jest.fn(),
    };

    orderRepository = {
      findCustomerOrders: jest.fn().mockResolvedValue({
        orders: [makeCodOrder()],
        total: 1,
      }),
      findCustomerOrderById: jest.fn().mockResolvedValue(makeCodOrder()),
      findAllOrdersAdmin: jest.fn().mockResolvedValue({
        orders: [makeCodOrder()],
        total: 1,
      }),
      findOrderByIdWithDetails: jest.fn().mockResolvedValue(makeCodOrder()),
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
    } as unknown as jest.Mocked<OrderRepository>;

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const mockManager = {
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === Order) {
              return {
                save: jest.fn().mockImplementation((o: any) => Promise.resolve(o)),
              };
            }
            if (entity === Payment) {
              return {
                findOne: jest.fn().mockResolvedValue(mockPayment),
                save: jest.fn().mockImplementation((p: any) => Promise.resolve(p)),
              };
            }
            return {};
          }),
        };
        return cb(mockManager);
      }),
      getRepository: jest.fn().mockReturnValue(mockOrderRepo),
    } as unknown as jest.Mocked<DataSource>;

    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
    };
    mockEmailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: orderRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // isOrderPaymentExpired — unit tests
  // ══════════════════════════════════════════════════════════════════════════

  describe('isOrderPaymentExpired', () => {
    describe('ONLINE orders', () => {
      it('returns false when expiredAt is in the future (payment window still open)', () => {
        const order = makeOnlineOrder({
          expiredAt: new Date(Date.now() + 10 * 60 * 1000),
        });
        expect(service.isOrderPaymentExpired(order)).toBe(false);
      });

      it('returns true when expiredAt is in the past', () => {
        const order = makeOnlineOrder({
          expiredAt: new Date(Date.now() - 1000),
        });
        expect(service.isOrderPaymentExpired(order)).toBe(true);
      });

      it('returns true when orderStatus is already EXPIRED regardless of expiredAt', () => {
        const order = makeOnlineOrder({
          orderStatus: ORDER_STATUS.EXPIRED,
          expiredAt: new Date(Date.now() + 60 * 1000), // future — still EXPIRED because of status
        });
        expect(service.isOrderPaymentExpired(order)).toBe(true);
      });

      it('returns false when order is already PAID — never expire a paid order', () => {
        const order = makeOnlineOrder({
          paymentStatus: ORDER_PAYMENT_STATUS.PAID,
          expiredAt: new Date(Date.now() - 1000),
        });
        expect(service.isOrderPaymentExpired(order)).toBe(false);
      });

      it('returns false when expiredAt is null', () => {
        const order = makeOnlineOrder({ expiredAt: null });
        expect(service.isOrderPaymentExpired(order)).toBe(false);
      });

      it('calling isOrderPaymentExpired does NOT modify expiredAt (immutability)', () => {
        const originalExpiry = new Date(Date.now() + 20 * 60 * 1000);
        const order = makeOnlineOrder({ expiredAt: originalExpiry });
        service.isOrderPaymentExpired(order);
        expect(order.expiredAt).toBe(originalExpiry);
      });
    });

    describe('COD orders', () => {
      it('returns false for COD order with expiredAt = null', () => {
        expect(service.isOrderPaymentExpired(makeCodOrder({ expiredAt: null }))).toBe(false);
      });

      it('returns false for COD order even when 30 minutes have passed (no ONLINE timeout)', () => {
        const order = makeCodOrder({
          expiredAt: new Date(Date.now() - 30 * 60 * 1000),
        });
        expect(service.isOrderPaymentExpired(order)).toBe(false);
      });

      it('returns false for COD order in COD_PENDING status', () => {
        expect(
          service.isOrderPaymentExpired(
            makeCodOrder({
              paymentStatus: ORDER_PAYMENT_STATUS.COD_PENDING,
              orderStatus: ORDER_STATUS.CONFIRMED,
            }),
          ),
        ).toBe(false);
      });

      it('returns false for PAID COD order', () => {
        expect(
          service.isOrderPaymentExpired(
            makeCodOrder({
              paymentStatus: ORDER_PAYMENT_STATUS.PAID,
              orderStatus: ORDER_STATUS.DELIVERED,
            }),
          ),
        ).toBe(false);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // materializeExpiredOrders cron
  // ══════════════════════════════════════════════════════════════════════════

  describe('materializeExpiredOrders', () => {
    function buildCronQueryBuilder(affectedRows: number) {
      const executeMock = jest.fn().mockResolvedValue({ affected: affectedRows });
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: executeMock,
      };
      dataSource.getRepository = jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });
      return { qb, executeMock };
    }

    it('only expires ONLINE+PENDING orders with expired expiredAt', async () => {
      const { qb } = buildCronQueryBuilder(2);
      const affected = await service.materializeExpiredOrders();
      expect(affected).toBe(2);
      // Must include ONLINE filter to exclude COD
      expect(qb.andWhere).toHaveBeenCalledWith(
        'paymentMethod = :onlineMethod',
        { onlineMethod: ORDER_PAYMENT_METHOD.ONLINE },
      );
    });

    it('returns 0 when no eligible orders exist', async () => {
      buildCronQueryBuilder(0);
      await expect(service.materializeExpiredOrders()).resolves.toBe(0);
    });

    it('is idempotent — second run returns 0 because EXPIRED orders no longer match WHERE', async () => {
      buildCronQueryBuilder(3);
      let affected = await service.materializeExpiredOrders();
      expect(affected).toBe(3);

      buildCronQueryBuilder(0);
      affected = await service.materializeExpiredOrders();
      expect(affected).toBe(0);
    });

    it('returns 0 safely when DB throws', async () => {
      dataSource.getRepository = jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockImplementation(() => {
          throw new Error('DB error');
        }),
      });
      await expect(service.materializeExpiredOrders()).resolves.toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getOrders — lazy expiry materialization
  // ══════════════════════════════════════════════════════════════════════════

  describe('getOrders — lazy expiry materialization for CUSTOMER', () => {
    it('expired ONLINE order is filtered out from customer view', async () => {
      const expiredOnline = makeOnlineOrder({
        expiredAt: new Date(Date.now() - 5000),
      });
      orderRepository.findCustomerOrders.mockResolvedValueOnce({
        orders: [expiredOnline],
        total: 1,
      });
      const saveMock = jest.fn().mockResolvedValue([expiredOnline]);
      dataSource.getRepository = jest.fn().mockReturnValue({ save: saveMock });

      const result = await service.getOrders(customerUser, { page: 1, limit: 10 });
      expect(result.orders).toHaveLength(0);
      expect(saveMock).toHaveBeenCalled();
    });

    it('COD order is NEVER marked EXPIRED even with an old createdAt', async () => {
      const oldCod = makeCodOrder({
        expiredAt: new Date(Date.now() - 30 * 60 * 1000), // stress-test
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      orderRepository.findCustomerOrders.mockResolvedValueOnce({
        orders: [oldCod],
        total: 1,
      });
      const result = await service.getOrders(customerUser, { page: 1, limit: 10 });
      expect(result.orders[0].orderStatus).toBe(ORDER_STATUS.CONFIRMED);
    });

    it('ONLINE order within window stays PENDING_PAYMENT', async () => {
      const freshOnline = makeOnlineOrder({
        expiredAt: new Date(Date.now() + 25 * 60 * 1000),
      });
      orderRepository.findCustomerOrders.mockResolvedValueOnce({
        orders: [freshOnline],
        total: 1,
      });
      const result = await service.getOrders(customerUser, { page: 1, limit: 10 });
      expect(result.orders[0].orderStatus).toBe(ORDER_STATUS.PENDING_PAYMENT);
    });

    it('CUSTOMER only sees own orders', async () => {
      const result = await service.getOrders(customerUser, { page: 1, limit: 10 });
      expect(orderRepository.findCustomerOrders).toHaveBeenCalledWith(
        customerUser.id,
        { page: 1, limit: 10 },
      );
      expect(orderRepository.findAllOrdersAdmin).not.toHaveBeenCalled();
    });

    it('ADMIN sees all orders', async () => {
      const result = await service.getOrders(adminUser, { page: 1, limit: 10 });
      expect(orderRepository.findAllOrdersAdmin).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
      expect(result.orders).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getOrderById
  // ══════════════════════════════════════════════════════════════════════════

  describe('getOrderById', () => {
    it('CUSTOMER views active ONLINE order — status stays PENDING_PAYMENT', async () => {
      orderRepository.findCustomerOrderById.mockResolvedValueOnce(makeOnlineOrder());
      const order = await service.getOrderById(customerUser, 101);
      expect(order.orderStatus).toBe(ORDER_STATUS.PENDING_PAYMENT);
    });

    it('CUSTOMER: expired ONLINE order is materialized as EXPIRED and hidden from customer', async () => {
      orderRepository.findCustomerOrderById.mockResolvedValueOnce(
        makeOnlineOrder({ expiredAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.getOrderById(customerUser, 101)).rejects.toThrow(
        NotFoundException,
      );
      expect(orderRepository.save).toHaveBeenCalled();
    });

    it('CUSTOMER: COD order is NOT marked EXPIRED regardless of age', async () => {
      orderRepository.findCustomerOrderById.mockResolvedValueOnce(
        makeCodOrder({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }),
      );
      const order = await service.getOrderById(customerUser, 202);
      expect(order.orderStatus).toBe(ORDER_STATUS.CONFIRMED);
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('CUSTOMER gets NotFoundException for unknown order', async () => {
      orderRepository.findCustomerOrderById.mockResolvedValueOnce(null);
      await expect(service.getOrderById(customerUser, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ADMIN can access any order', async () => {
      const order = await service.getOrderById(adminUser, 202);
      expect(orderRepository.findOrderByIdWithDetails).toHaveBeenCalledWith(202);
      expect(order).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateOrderStatus
  // ══════════════════════════════════════════════════════════════════════════

  describe('updateOrderStatus', () => {
    it('CUSTOMER is forbidden', async () => {
      await expect(
        service.updateOrderStatus(customerUser, 101, { status: ORDER_STATUS.SHIPPED }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN updates status and fires audit + notification + email', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(
        makeCodOrder({ orderStatus: ORDER_STATUS.CONFIRMED }),
      );
      const updated = await service.updateOrderStatus(adminUser, 202, {
        status: ORDER_STATUS.SHIPPED,
      });
      expect(updated.orderStatus).toBe(ORDER_STATUS.SHIPPED);
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_STATUS_CHANGED' }),
      );
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        customerUser.id,
        'Order Status Updated',
        expect.stringContaining('SHIPPED'),
        expect.anything(),
        202,
        'ORDER',
      );
    });

    it('ADMIN updating to the SAME status is a no-op', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(
        makeCodOrder({ orderStatus: ORDER_STATUS.SHIPPED }),
      );
      await service.updateOrderStatus(adminUser, 202, { status: ORDER_STATUS.SHIPPED });
      expect(orderRepository.save).not.toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // collectCodPayment + COD/ONLINE isolation
  // ══════════════════════════════════════════════════════════════════════════

  describe('collectCodPayment', () => {
    it('CUSTOMER is forbidden', async () => {
      await expect(service.collectCodPayment(customerUser, 202)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN collects COD: updates paymentStatus to PAID, fires audit + notification + email', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(makeCodOrder());
      const updated = await service.collectCodPayment(adminUser, 202, {
        collectedAmount: 300,
        remark: 'Cash collected',
      });
      expect(updated.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COD_PAYMENT_COLLECTED' }),
      );
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        customerUser.id,
        'COD Payment Collected',
        expect.stringContaining('300'),
        expect.anything(),
        202,
        'ORDER',
      );
    });

    it('throws 400 when COD order is already PAID', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(
        makeCodOrder({ paymentStatus: ORDER_PAYMENT_STATUS.PAID }),
      );
      await expect(service.collectCodPayment(adminUser, 202)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 400 when trying to COD-collect an ONLINE order', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(
        makeOnlineOrder(),
      );
      await expect(service.collectCodPayment(adminUser, 101)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('isOrderPaymentExpired returns false for a very old COD order', () => {
      const veryOldCod = makeCodOrder({
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiredAt: null,
      });
      expect(service.isOrderPaymentExpired(veryOldCod)).toBe(false);
    });
  });
});
