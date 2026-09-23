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

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let dataSource: jest.Mocked<DataSource>;

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

  const mockOrder: Order = {
    id: 101,
    orderNumber: 'PW-ORD-123456-7890',
    customerId: customerUser.id,
    subtotal: 500,
    discountAmount: 0,
    totalAmount: 500,
    paymentId: 301,
    paymentMethod: ORDER_PAYMENT_METHOD.COD,
    paymentStatus: ORDER_PAYMENT_STATUS.COD_PENDING,
    orderStatus: ORDER_STATUS.CONFIRMED,
    shippingAddressSnapshot: {
      name: 'Devotee Sharma',
      phone: '9876543210',
      addressLine1: '123 Temple Road',
      city: 'Varanasi',
      pincode: '221001',
    },
    items: [
      {
        id: 1,
        orderId: 101,
        productId: 10,
        productNameSnapshot: 'Puja Thali',
        productImageSnapshot: null,
        unitPriceSnapshot: 500,
        quantity: 1,
        totalAmount: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as OrderItem,
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPayment: Payment = {
    id: 301,
    amount: 500,
    status: PAYMENT_STATUS.PENDING,
  } as unknown as Payment;

  let mockAuditLogService: { createAuditLog: jest.Mock };
  let mockNotificationService: { createNotification: jest.Mock };
  let mockEmailService: { sendMail: jest.Mock };

  beforeEach(async () => {
    orderRepository = {
      findCustomerOrders: jest.fn().mockResolvedValue({
        orders: [mockOrder],
        total: 1,
      }),
      findCustomerOrderById: jest.fn().mockResolvedValue(mockOrder),
      findAllOrdersAdmin: jest.fn().mockResolvedValue({
        orders: [mockOrder],
        total: 1,
      }),
      findOrderByIdWithDetails: jest.fn().mockResolvedValue(mockOrder),
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
    } as unknown as jest.Mocked<OrderRepository>;

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === Order) {
              return {
                save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
              };
            }
            if (entity === Payment) {
              return {
                findOne: jest.fn().mockResolvedValue(mockPayment),
                save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
              };
            }
            return {};
          }),
        };
        return cb(mockManager);
      }),
    } as unknown as jest.Mocked<DataSource>;

    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    mockEmailService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };

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

  describe('getOrders', () => {
    it('CUSTOMER should retrieve only own orders', async () => {
      const result = await service.getOrders(customerUser, { page: 1, limit: 10 });
      expect(orderRepository.findCustomerOrders).toHaveBeenCalledWith(
        customerUser.id,
        { page: 1, limit: 10 },
      );
      expect(orderRepository.findAllOrdersAdmin).not.toHaveBeenCalled();
      expect(result.orders).toHaveLength(1);
    });

    it('ADMIN should retrieve all orders across customers', async () => {
      const result = await service.getOrders(adminUser, { page: 1, limit: 10 });
      expect(orderRepository.findAllOrdersAdmin).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
      expect(orderRepository.findCustomerOrders).not.toHaveBeenCalled();
      expect(result.orders).toHaveLength(1);
    });
  });

  describe('getOrderById', () => {
    it('CUSTOMER can view own order', async () => {
      const order = await service.getOrderById(customerUser, 101);
      expect(orderRepository.findCustomerOrderById).toHaveBeenCalledWith(
        customerUser.id,
        101,
      );
      expect(order).toBeDefined();
      expect(order.id).toBe(101);
    });

    it('CUSTOMER gets NotFoundException for another customer order', async () => {
      orderRepository.findCustomerOrderById.mockResolvedValueOnce(null);
      await expect(service.getOrderById(customerUser, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ADMIN can view any order', async () => {
      const order = await service.getOrderById(adminUser, 101);
      expect(orderRepository.findOrderByIdWithDetails).toHaveBeenCalledWith(101);
      expect(order.id).toBe(101);
    });
  });

  describe('updateOrderStatus', () => {
    it('CUSTOMER is forbidden from updating order status', async () => {
      await expect(
        service.updateOrderStatus(customerUser, 101, {
          status: ORDER_STATUS.SHIPPED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can update order fulfillment status and triggers audit, notification, and email', async () => {
      const updated = await service.updateOrderStatus(adminUser, 101, {
        status: ORDER_STATUS.SHIPPED,
      });
      expect(updated.orderStatus).toBe(ORDER_STATUS.SHIPPED);
      expect(orderRepository.save).toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_STATUS_CHANGED',
          entityId: '101',
        }),
      );
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        customerUser.id,
        'Order Status Updated',
        expect.stringContaining('SHIPPED'),
        expect.anything(),
        101,
        'ORDER',
      );
    });

    it('ADMIN updating with SAME status does NOT trigger audit, notification, or email', async () => {
      mockOrder.orderStatus = ORDER_STATUS.SHIPPED;
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(mockOrder);

      await service.updateOrderStatus(adminUser, 101, {
        status: ORDER_STATUS.SHIPPED,
      });

      expect(orderRepository.save).not.toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).not.toHaveBeenCalled();
      expect(mockNotificationService.createNotification).not.toHaveBeenCalled();
      expect(mockEmailService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('collectCodPayment', () => {
    it('CUSTOMER is forbidden from collecting COD payment', async () => {
      await expect(service.collectCodPayment(customerUser, 101)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN can collect COD payment: updates Payment and Order paymentStatus to PAID and triggers audit, notification, email', async () => {
      mockOrder.orderStatus = ORDER_STATUS.CONFIRMED;
      mockOrder.paymentStatus = ORDER_PAYMENT_STATUS.COD_PENDING;
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce(mockOrder);

      const updated = await service.collectCodPayment(adminUser, 101, {
        collectedAmount: 500,
        remark: 'Received cash at delivery',
      });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(updated.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COD_PAYMENT_COLLECTED',
          entityId: '101',
        }),
      );
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        customerUser.id,
        'COD Payment Collected',
        expect.stringContaining('500'),
        expect.anything(),
        101,
        'ORDER',
      );
    });

    it('ADMIN collecting COD for already paid order throws BadRequestException', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce({
        ...mockOrder,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      });

      await expect(service.collectCodPayment(adminUser, 101)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ADMIN collecting COD for ONLINE order throws BadRequestException', async () => {
      orderRepository.findOrderByIdWithDetails.mockResolvedValueOnce({
        ...mockOrder,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
      });

      await expect(service.collectCodPayment(adminUser, 101)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
