jest.mock('puppeteer', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import {
  Order,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  User,
  USER_ROLE,
  USER_STATUS,
} from '@poojawala/entities';

describe('OrderController', () => {
  let controller: OrderController;
  let service: jest.Mocked<OrderService>;

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
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      getOrders: jest.fn().mockResolvedValue({
        orders: [mockOrder],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
      getOrderById: jest.fn().mockResolvedValue(mockOrder),
      updateOrderStatus: jest.fn().mockResolvedValue({
        ...mockOrder,
        orderStatus: ORDER_STATUS.SHIPPED,
      }),
      collectCodPayment: jest.fn().mockResolvedValue({
        ...mockOrder,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      }),
    } as unknown as jest.Mocked<OrderService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{ provide: OrderService, useValue: service }],
    }).compile();

    controller = module.get<OrderController>(OrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /orders delegates to service.getOrders with authenticated user and query', async () => {
    const res = await controller.getOrders({ user: customerUser }, { page: 1 });
    expect(res.success).toBe(true);
    expect(service.getOrders).toHaveBeenCalledWith(customerUser, { page: 1 });
    expect(res.data.orders).toHaveLength(1);
  });

  it('GET /orders/:id delegates to service.getOrderById', async () => {
    const res = await controller.getOrderById({ user: customerUser }, 101);
    expect(res.success).toBe(true);
    expect(service.getOrderById).toHaveBeenCalledWith(customerUser, 101);
    expect(res.data.id).toBe(101);
  });

  it('PATCH /orders/:id/status delegates to service.updateOrderStatus', async () => {
    const res = await controller.updateOrderStatus(
      { user: customerUser },
      101,
      { status: ORDER_STATUS.SHIPPED },
    );
    expect(res.success).toBe(true);
    expect(service.updateOrderStatus).toHaveBeenCalledWith(customerUser, 101, {
      status: ORDER_STATUS.SHIPPED,
    });
    expect(res.data.orderStatus).toBe(ORDER_STATUS.SHIPPED);
  });

  it('PATCH /orders/:id/collect-cod delegates to service.collectCodPayment', async () => {
    const res = await controller.collectCodPayment(
      { user: customerUser },
      101,
      { collectedAmount: 500 },
    );
    expect(res.success).toBe(true);
    expect(service.collectCodPayment).toHaveBeenCalledWith(customerUser, 101, {
      collectedAmount: 500,
    });
    expect(res.data.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);
  });
});
