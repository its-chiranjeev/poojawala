import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

jest.mock('puppeteer', () => ({}));

import { CartService } from './cart.service';
import { PaymentService } from '../../../payment-service/src/payment/payment.service';
import {
  BookingProductRepository,
  BookingRepository,
  CartItemRepository,
  CartRepository,
  CustomerAddressRepository,
  OrderRepository,
  PaymentRepository,
  ProductRepository,
} from '@poojawala/repositories';
import {
  Booking,
  BOOKING_STATUS,
  BookingProduct,
  Cart,
  CartItem,
  CustomerAddress,
  Order,
  OrderItem,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  Payment,
  Product,
  PRODUCT_PRICING_UNIT,
  User,
  USER_ROLE,
  USER_STATUS,
} from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { NotificationService } from '@poojawala/notification';
import { EmailService } from '@poojawala/email-services';

describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<CartRepository>;
  let cartItemRepository: jest.Mocked<CartItemRepository>;
  let productRepository: jest.Mocked<ProductRepository>;
  let bookingRepository: jest.Mocked<BookingRepository>;
  let bookingProductRepository: jest.Mocked<BookingProductRepository>;
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let customerAddressRepository: jest.Mocked<CustomerAddressRepository>;
  let mockTxCartItemDelete: jest.Mock;
  let dataSource: jest.Mocked<DataSource>;
  let paymentService: { createRazorpayPaymentLink: jest.Mock };
  let auditLogService: { createAuditLog: jest.Mock };
  let notificationService: { createNotification: jest.Mock };
  let emailService: { sendMail: jest.Mock };

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

  const otherCustomer: User = {
    ...customerUser,
    id: 2,
    username: 'othercustomer',
  };

  const activeProduct: Product = {
    id: 10,
    name: 'Puja Thali',
    description: 'Brass puja thali with diya',
    price: 499.0,
    pricingUnit: PRODUCT_PRICING_UNIT.PIECE,
    quantity: 50,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const inactiveProduct: Product = {
    ...activeProduct,
    id: 11,
    name: 'Rare Idol',
    isActive: false,
  };

  const mockCart: Cart = {
    id: 100,
    customerId: customerUser.id,
    customer: customerUser,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    cartRepository = {
      findOrCreateCart: jest.fn().mockResolvedValue(mockCart),
      findCartWithItems: jest.fn().mockResolvedValue(mockCart),
      findOne: jest.fn().mockResolvedValue(mockCart),
      save: jest.fn().mockImplementation((cart) => Promise.resolve(cart)),
    } as unknown as jest.Mocked<CartRepository>;

    cartItemRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((item) => Promise.resolve(item)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      removeByCartId: jest.fn().mockResolvedValue(undefined),
      findCartItemsWithPagination: jest.fn().mockResolvedValue({
        items: [
          {
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        totalItems: 0,
      }),
      findAllValidItemsByCartId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CartItemRepository>;

    productRepository = {
      findOne: jest.fn().mockResolvedValue(activeProduct),
    } as unknown as jest.Mocked<ProductRepository>;

    bookingRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<BookingRepository>;

    bookingProductRepository = {
      findByBookingId: jest.fn().mockResolvedValue([]),
      findByCustomerId: jest.fn().mockResolvedValue([]),
      findByPaymentId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<BookingProductRepository>;

    paymentRepository = {
      savePayment: jest.fn().mockImplementation((p) => Promise.resolve(p)),
      findPaymentById: jest.fn(),
    } as unknown as jest.Mocked<PaymentRepository>;

    orderRepository = {
      findCustomerOrders: jest.fn(),
      findCustomerOrderById: jest.fn(),
      findAllOrdersAdmin: jest.fn(),
      findOrderByIdWithDetails: jest.fn(),
      findByPaymentId: jest.fn(),
      save: jest.fn().mockImplementation((order) => Promise.resolve(order)),
    } as unknown as jest.Mocked<OrderRepository>;

    customerAddressRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        customerId: customerUser.id,
        addressLabel: 'Home',
        fullAddress: '123 Temple Road',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        pincode: '221001',
        isDefault: true,
      }),
    } as unknown as jest.Mocked<CustomerAddressRepository>;

    mockTxCartItemDelete = jest.fn().mockResolvedValue({ affected: 1 });

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const mockManager = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === Cart) {
              const mockCartQb = {
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(mockCart),
              };
              return {
                findOne: jest.fn().mockResolvedValue(mockCart),
                create: jest.fn().mockReturnValue(mockCart),
                save: jest.fn().mockResolvedValue(mockCart),
                createQueryBuilder: jest.fn().mockReturnValue(mockCartQb),
              };
            }
            if (entity === CartItem) {
              return {
                findOne: jest.fn().mockResolvedValue(null),
                create: jest
                  .fn()
                  .mockImplementation((dto) => ({ id: 200, ...dto })),
                save: jest
                  .fn()
                  .mockImplementation((item) =>
                    Promise.resolve({ id: 200, ...item }),
                  ),
                delete: mockTxCartItemDelete,
              };
            }
            if (entity === Payment) {
              return {
                create: jest
                  .fn()
                  .mockImplementation((dto) => ({ id: 500, ...dto })),
                save: jest
                  .fn()
                  .mockImplementation((item) =>
                    Promise.resolve({ id: 500, ...item }),
                  ),
              };
            }
            if (entity === Order) {
              const mockOrderQb = {
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(null),
              };
              return {
                create: jest
                  .fn()
                  .mockImplementation((dto) => ({ id: 1001, ...dto, createdAt: new Date(), updatedAt: new Date() })),
                save: jest
                  .fn()
                  .mockImplementation((item) =>
                    Promise.resolve({ id: 1001, ...item, createdAt: new Date(), updatedAt: new Date() }),
                  ),
                createQueryBuilder: jest.fn().mockReturnValue(mockOrderQb),
              };
            }
            if (entity === OrderItem) {
              return {
                create: jest
                  .fn()
                  .mockImplementation((dto) => ({ id: 2001, ...dto })),
                save: jest
                  .fn()
                  .mockImplementation((items) =>
                    Promise.resolve(Array.isArray(items) ? items : [items]),
                  ),
              };
            }
            if (entity === BookingProduct) {
              return {
                create: jest
                  .fn()
                  .mockImplementation((dto) => ({ id: 600, ...dto })),
                save: jest
                  .fn()
                  .mockImplementation((item) =>
                    Promise.resolve({ id: 600, ...item }),
                  ),
              };
            }
            return {};
          }),
        };
        return cb(mockManager);
      }),
    } as unknown as jest.Mocked<DataSource>;

    paymentService = {
      createRazorpayPaymentLink: jest.fn().mockResolvedValue({
        id: 'plink_test123',
        short_url: 'https://rzp.io/i/test1234',
        currency: 'INR',
        amount: 99800,
        status: 'created',
      }),
    };

    auditLogService = {
      createAuditLog: jest.fn().mockResolvedValue({}),
    };

    notificationService = {
      createNotification: jest.fn().mockResolvedValue({}),
      notifyAdmins: jest.fn().mockResolvedValue([]),
    };

    emailService = {
      sendMail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: cartRepository },
        { provide: CartItemRepository, useValue: cartItemRepository },
        { provide: ProductRepository, useValue: productRepository },
        { provide: BookingRepository, useValue: bookingRepository },
        {
          provide: BookingProductRepository,
          useValue: bookingProductRepository,
        },
        { provide: PaymentRepository, useValue: paymentRepository },
        { provide: OrderRepository, useValue: orderRepository },
        {
          provide: CustomerAddressRepository,
          useValue: customerAddressRepository,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: PaymentService, useValue: paymentService },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: NotificationService, useValue: notificationService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addToCart', () => {
    it('should successfully add a new product to customer cart', async () => {
      const result = await service.addToCart(customerUser, {
        productId: 10,
        quantity: 2,
      });

      expect(productRepository.findOne).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(auditLogService.createAuditLog).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not a customer', async () => {
      const purohitUser = { ...customerUser, role: USER_ROLE.PUROHIT };
      await expect(
        service.addToCart(purohitUser, { productId: 10, quantity: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      productRepository.findOne.mockResolvedValueOnce(null);
      await expect(
        service.addToCart(customerUser, { productId: 999, quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if product is inactive', async () => {
      productRepository.findOne.mockResolvedValueOnce(inactiveProduct);
      await expect(
        service.addToCart(customerUser, { productId: 11, quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if quantity is zero or negative', async () => {
      await expect(
        service.addToCart(customerUser, { productId: 10, quantity: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCart', () => {
    const cartItem: CartItem = {
      id: 201,
      cartId: mockCart.id,
      cart: mockCart,
      productId: activeProduct.id,
      product: activeProduct,
      quantity: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should calculate subtotal, total, and return pagination metadata', async () => {
      cartItemRepository.findCartItemsWithPagination.mockResolvedValueOnce({
        items: [cartItem],
        totalItems: 1,
      });
      cartItemRepository.findAllValidItemsByCartId.mockResolvedValueOnce([
        cartItem,
      ]);

      const result = await service.getCart(customerUser, {
        page: 1,
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].unitPrice).toBe(499);
      expect(result.items[0].quantity).toBe(3);
      expect(result.items[0].subtotal).toBe(1497);
      expect(result.total).toBe(1497);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalItems).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should pass search filter to repository and return matching items', async () => {
      cartItemRepository.findCartItemsWithPagination.mockResolvedValueOnce({
        items: [cartItem],
        totalItems: 1,
      });
      cartItemRepository.findAllValidItemsByCartId.mockResolvedValueOnce([
        cartItem,
      ]);

      const result = await service.getCart(customerUser, {
        page: 1,
        limit: 5,
        search: 'Puja',
      });
      expect(
        cartItemRepository.findCartItemsWithPagination,
      ).toHaveBeenCalledWith(mockCart.id, {
        page: 1,
        limit: 5,
        search: 'Puja',
      });
      expect(
        cartItemRepository.findAllValidItemsByCartId,
      ).toHaveBeenCalledWith(mockCart.id, 'Puja');
      expect(result.items[0].name).toBe('Puja Thali');
    });
  });

  describe('updateCartItem', () => {
    it('should update item quantity for owner', async () => {
      const existingItem: CartItem = {
        id: 201,
        cartId: mockCart.id,
        cart: mockCart,
        productId: activeProduct.id,
        product: activeProduct,
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      cartItemRepository.findOne.mockResolvedValueOnce(existingItem);

      await service.updateCartItem(customerUser, 201, { quantity: 5 });
      expect(existingItem.quantity).toBe(5);
      expect(cartItemRepository.save).toHaveBeenCalledWith(existingItem);
    });

    it('should throw ForbiddenException if customer does not own the cart item (Horizontal Escalation)', async () => {
      const otherCart: Cart = {
        ...mockCart,
        id: 999,
        customerId: otherCustomer.id,
      };
      const otherItem: CartItem = {
        id: 301,
        cartId: otherCart.id,
        cart: otherCart,
        productId: activeProduct.id,
        product: activeProduct,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      cartItemRepository.findOne.mockResolvedValueOnce(otherItem);

      await expect(
        service.updateCartItem(customerUser, 301, { quantity: 4 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeCartItem', () => {
    it('should remove item when owned by customer', async () => {
      const existingItem: CartItem = {
        id: 201,
        cartId: mockCart.id,
        cart: mockCart,
        productId: activeProduct.id,
        product: activeProduct,
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      cartItemRepository.findOne.mockResolvedValueOnce(existingItem);

      const res = await service.removeCartItem(customerUser, 201);
      expect(res.success).toBe(true);
      expect(cartItemRepository.delete).toHaveBeenCalledWith(201);
    });

    it('should throw ForbiddenException if customer does not own the cart item', async () => {
      const otherCart: Cart = {
        ...mockCart,
        id: 999,
        customerId: otherCustomer.id,
      };
      const otherItem: CartItem = {
        id: 301,
        cartId: otherCart.id,
        cart: otherCart,
        productId: activeProduct.id,
        product: activeProduct,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      cartItemRepository.findOne.mockResolvedValueOnce(otherItem);

      await expect(service.removeCartItem(customerUser, 301)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('clearCart', () => {
    it('should remove all items from the customer cart', async () => {
      const res = await service.clearCart(customerUser);
      expect(res.success).toBe(true);
      expect(cartItemRepository.removeByCartId).toHaveBeenCalledWith(
        mockCart.id,
      );
    });
  });

  describe('checkout', () => {
    it('should throw BadRequestException when checking out an empty cart', async () => {
      cartRepository.findCartWithItems.mockResolvedValueOnce({
        ...mockCart,
        items: [
          {
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
      });

      await expect(service.checkout(customerUser, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create Order, OrderItem snapshot, and Payment record for ONLINE checkout and return payment link', async () => {
      const cartWithItem: Cart = {
        ...mockCart,
        items: [
          {
            id: 201,
            cartId: mockCart.id,
            cart: mockCart,
            productId: activeProduct.id,
            product: activeProduct,
            quantity: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      cartRepository.findCartWithItems.mockResolvedValueOnce(cartWithItem);

      paymentService.createRazorpayPaymentLink.mockResolvedValueOnce({
        id: 'plink_test123',
        short_url: 'https://rzp.io/i/test1234',
      });

      const result = await service.checkout(customerUser, {
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
      });

      expect(result.amount).toBe(998);
      expect(result.paymentUrl).toBe('https://rzp.io/i/test1234');
      expect(result.orderId).toBeDefined();
      expect(result.orderNumber).toBeDefined();
      expect(result.paymentMethod).toBe(ORDER_PAYMENT_METHOD.ONLINE);
      expect(result.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PENDING);
      expect(result.orderStatus).toBe(ORDER_STATUS.PENDING_PAYMENT);
      expect(result.expiredAt).toBeNull();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productName).toBe('Puja Thali');
      expect(result.items[0].unitPrice).toBe(499);
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].total).toBe(998);

      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_CREATED',
          entityId: '1001',
        }),
      );
      expect(notificationService.createNotification).toHaveBeenCalled();
      expect(emailService.sendMail).toHaveBeenCalled();
      // Cart items must NOT be cleared during ONLINE checkout
      expect(mockTxCartItemDelete).not.toHaveBeenCalled();
    });

    it('should create Order, OrderItem snapshot, and Payment record for COD, clear cart, and NOT call Razorpay', async () => {
      const cartWithItem: Cart = {
        ...mockCart,
        items: [
          {
            id: 201,
            cartId: mockCart.id,
            cart: mockCart,
            productId: activeProduct.id,
            product: activeProduct,
            quantity: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      cartRepository.findCartWithItems.mockResolvedValueOnce(cartWithItem);

      const result = await service.checkout(customerUser, {
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });

      expect(result.amount).toBe(499);
      expect(result.paymentUrl).toBeNull();
      expect(result.orderId).toBeDefined();
      expect(result.paymentMethod).toBe(ORDER_PAYMENT_METHOD.COD);
      expect(result.paymentStatus).toBe(ORDER_PAYMENT_STATUS.COD_PENDING);
      expect(result.orderStatus).toBe(ORDER_STATUS.CONFIRMED);
      expect(result.expiredAt).toBeNull();
      expect(paymentService.createRazorpayPaymentLink).not.toHaveBeenCalled();

      expect(auditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_CREATED',
          entityId: '1001',
        }),
      );
      expect(notificationService.createNotification).toHaveBeenCalled();
      expect(emailService.sendMail).toHaveBeenCalled();
      // COD checkout clears only the purchased items
      expect(mockTxCartItemDelete).toHaveBeenCalledWith({
        cartId: mockCart.id,
        productId: activeProduct.id,
      });
    });

    it('should retry payment for an existing unpaid order without creating duplicate orders', async () => {
      const mockOrder: Order = {
        id: 55,
        orderNumber: 'PW-ORD-100001',
        customerId: customerUser.id,
        subtotal: 998,
        discountAmount: 0,
        totalAmount: 998,
        paymentId: 501,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
        shippingAddressSnapshot: {
          name: 'Devotee Sharma',
          phone: '9876543210',
          addressLine1: '123 Temple Road',
          city: 'Varanasi',
          pincode: '221001',
        },
        items: [
          {
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderRepository.findCustomerOrderById.mockResolvedValueOnce(mockOrder);

      paymentService.createRazorpayPaymentLink.mockResolvedValueOnce({
        id: 'plink_retry_123',
        short_url: 'https://rzp.io/i/retry1234',
      });

      const result = await service.checkout(customerUser, {
        orderId: 55,
      });

      expect(result.orderId).toBe(55);
      expect(result.orderNumber).toBe('PW-ORD-100001');
      expect(result.paymentUrl).toBe('https://rzp.io/i/retry1234');
      expect(paymentService.createRazorpayPaymentLink).toHaveBeenCalled();
    });

    it('should throw BadRequestException when retrying payment for an already paid order', async () => {
      const paidOrder: Order = {
        id: 56,
        orderNumber: 'PW-ORD-100002',
        customerId: customerUser.id,
        subtotal: 998,
        discountAmount: 0,
        totalAmount: 998,
        paymentId: 502,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
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
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderRepository.findCustomerOrderById.mockResolvedValueOnce(paidOrder);

      await expect(
        service.checkout(customerUser, { orderId: 56 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when retrying payment for an expired order', async () => {
      const expiredOrder: Order = {
        id: 57,
        orderNumber: 'PW-ORD-100003',
        customerId: customerUser.id,
        subtotal: 998,
        discountAmount: 0,
        totalAmount: 998,
        paymentId: 503,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
        expiredAt: new Date(Date.now() - 60000), // expired 1 minute ago
        shippingAddressSnapshot: {
          name: 'Devotee Sharma',
          phone: '9876543210',
          addressLine1: '123 Temple Road',
          city: 'Varanasi',
          pincode: '221001',
        },
        items: [
          {
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderRepository.findCustomerOrderById.mockResolvedValueOnce(expiredOrder);

      await expect(
        service.checkout(customerUser, { orderId: 57 }),
      ).rejects.toThrow('This order has expired. Please place a new order.');
    });

    it('should reuse existing active pending order during checkout when expiredAt > now without creating duplicate order or duplicate notifications', async () => {
      const existingFutureExpiry = new Date(Date.now() + 20 * 60 * 1000);
      const activePendingOrder: Order = {
        id: 20,
        orderNumber: 'PW-ORD-20',
        customerId: customerUser.id,
        subtotal: 998,
        discountAmount: 0,
        totalAmount: 998,
        paymentId: 500,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
        expiredAt: existingFutureExpiry,
        shippingAddressSnapshot: {
          name: 'Devotee Sharma',
          phone: '9876543210',
          addressLine1: '123 Temple Road',
          city: 'Varanasi',
          pincode: '221001',
        },
        items: [
          {
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const cartWithItem: Cart = {
        ...mockCart,
        items: [
          {
            id: 201,
            cartId: mockCart.id,
            cart: mockCart,
            productId: activeProduct.id,
            product: activeProduct,
            quantity: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      cartRepository.findCartWithItems.mockResolvedValueOnce(cartWithItem);

      // Setup dataSource transaction to return activePendingOrder from getOne
      (dataSource.transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const mockManager = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === Cart) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue({
                  setLock: jest.fn().mockReturnThis(),
                  where: jest.fn().mockReturnThis(),
                  getOne: jest.fn().mockResolvedValue(mockCart),
                }),
              };
            }
            if (entity === Payment) {
              return {
                create: jest.fn().mockImplementation((p) => ({ id: 501, ...p })),
                save: jest.fn().mockImplementation((p) => Promise.resolve({ id: 501, ...p })),
              };
            }
            if (entity === Order) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue({
                  leftJoinAndSelect: jest.fn().mockReturnThis(),
                  where: jest.fn().mockReturnThis(),
                  andWhere: jest.fn().mockReturnThis(),
                  orderBy: jest.fn().mockReturnThis(),
                  getOne: jest.fn().mockResolvedValue(activePendingOrder),
                }),
                save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
              };
            }
            if (entity === CartItem) {
              return {
                delete: jest.fn().mockResolvedValue({ affected: 1 }),
              };
            }
            return {};
          }),
        };
        return cb(mockManager);
      });

      paymentService.createRazorpayPaymentLink.mockResolvedValueOnce({
        id: 'plink_reuse_123',
        short_url: 'https://rzp.io/i/reuse123',
      });

      auditLogService.createAuditLog.mockClear();
      notificationService.createNotification.mockClear();
      emailService.sendMail.mockClear();

      const result = await service.checkout(customerUser, {
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
      });

      // Reused order ORD-20
      expect(result.orderId).toBe(20);
      expect(result.orderNumber).toBe('PW-ORD-20');
      // expiredAt must remain unchanged (not extended!)
      expect(result.expiredAt).toEqual(existingFutureExpiry);
      // No duplicate notifications/emails/audit logs
      expect(auditLogService.createAuditLog).not.toHaveBeenCalled();
      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
      // Even on reuse, cart items must NOT be cleared prematurely
      expect(mockTxCartItemDelete).not.toHaveBeenCalled();
    });

    it('should reuse existing active pending order during checkout when expiredAt is null without creating duplicate order', async () => {
      const activePendingOrder: Order = {
        id: 25,
        orderNumber: 'PW-ORD-25',
        customerId: customerUser.id,
        subtotal: 998,
        discountAmount: 0,
        totalAmount: 998,
        paymentId: 500,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
        expiredAt: null,
        shippingAddressSnapshot: {
          name: 'Devotee Sharma',
          phone: '9876543210',
          addressLine1: '123 Temple Road',
          city: 'Varanasi',
          pincode: '221001',
        },
        items: [
          {
            id: 2001,
            orderId: 25,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const cartWithItem: Cart = {
        ...mockCart,
        items: [
          {
            id: 201,
            cartId: mockCart.id,
            cart: mockCart,
            productId: activeProduct.id,
            product: activeProduct,
            quantity: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      cartRepository.findCartWithItems.mockResolvedValueOnce(cartWithItem);

      (dataSource.transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const mockManager = {
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity === Cart) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue({
                  setLock: jest.fn().mockReturnThis(),
                  where: jest.fn().mockReturnThis(),
                  getOne: jest.fn().mockResolvedValue(mockCart),
                }),
              };
            }
            if (entity === Payment) {
              return {
                create: jest.fn().mockImplementation((p) => ({ id: 505, ...p })),
                save: jest.fn().mockImplementation((p) => Promise.resolve({ id: 505, ...p })),
              };
            }
            if (entity === Order) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue({
                  leftJoinAndSelect: jest.fn().mockReturnThis(),
                  where: jest.fn().mockReturnThis(),
                  andWhere: jest.fn().mockReturnThis(),
                  orderBy: jest.fn().mockReturnThis(),
                  getOne: jest.fn().mockResolvedValue(activePendingOrder),
                }),
                save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
              };
            }
            if (entity === CartItem) {
              return {
                delete: jest.fn().mockResolvedValue({ affected: 1 }),
              };
            }
            return {};
          }),
        };
        return cb(mockManager);
      });

      paymentService.createRazorpayPaymentLink.mockResolvedValueOnce({
        id: 'plink_reuse_null_expiry',
        short_url: 'https://rzp.io/i/reusenull',
      });

      auditLogService.createAuditLog.mockClear();
      notificationService.createNotification.mockClear();
      emailService.sendMail.mockClear();

      const result = await service.checkout(customerUser, {
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
      });

      expect(result.orderId).toBe(25);
      expect(result.orderNumber).toBe('PW-ORD-25');
      expect(result.expiredAt).toBeNull();
      expect(auditLogService.createAuditLog).not.toHaveBeenCalled();
      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('should NOT reuse existing active pending order if current cart items do not match the pending order', async () => {
      const existingFutureExpiry = new Date(Date.now() + 20 * 60 * 1000);
      const activePendingOrder: Order = {
        id: 20,
        orderNumber: 'PW-ORD-20',
        customerId: customerUser.id,
        subtotal: 998,
        discountAmount: 0,
        totalAmount: 998,
        paymentId: 500,
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
        expiredAt: existingFutureExpiry,
        shippingAddressSnapshot: {
          name: 'Devotee Sharma',
          phone: '9876543210',
          addressLine1: '123 Temple Road',
          city: 'Varanasi',
          pincode: '221001',
        },
        items: [
          {
            id: 2001,
            orderId: 20,
            productId: activeProduct.id,
            snapshot: {
              productName: 'Puja Thali',
              unitPrice: 499,
              quantity: 2,
              totalAmount: 998,
            },
          } as any,
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Cart has changed! Customer added a new product
      const differentProduct: Product = {
        ...activeProduct,
        id: 999,
        name: 'Brass Bell',
        price: 250,
      };

      const cartWithDifferentItem: Cart = {
        ...mockCart,
        items: [
          {
            id: 201,
            cartId: mockCart.id,
            cart: mockCart,
            productId: activeProduct.id,
            product: activeProduct,
            quantity: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 202,
            cartId: mockCart.id,
            cart: mockCart,
            productId: differentProduct.id,
            product: differentProduct,
            quantity: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      cartRepository.findCartWithItems.mockResolvedValueOnce(cartWithDifferentItem);

      paymentService.createRazorpayPaymentLink.mockResolvedValueOnce({
        id: 'plink_new_123',
        short_url: 'https://rzp.io/i/new123',
      });

      const result = await service.checkout(customerUser, {
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
      });

      // Should create NEW order, NOT reuse order ORD-20
      expect(result.orderId).toBe(1001);
      expect(result.amount).toBe(1248); // 998 + 250
      expect(mockTxCartItemDelete).not.toHaveBeenCalled();
    });
  });
});
