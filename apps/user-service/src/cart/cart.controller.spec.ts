import { Test, TestingModule } from '@nestjs/testing';

jest.mock('puppeteer', () => ({}));

import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import {
  User,
  USER_ROLE,
  USER_STATUS,
  PAYMENT_STATUS,
} from '@poojawala/entities';

describe('CartController', () => {
  let controller: CartController;
  let service: jest.Mocked<CartService>;

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

  const mockCartResponse = {
    id: 100,
    customerId: 1,
    items: [
      {
        id: 201,
        productId: 10,
        name: 'Puja Thali',
        imageUrl: null,
        pricingUnit: 'PIECE',
        unitPrice: 499,
        quantity: 2,
        subtotal: 998,
      },
    ],
    total: 998,
    page: 1,
    limit: 10,
    totalItems: 1,
    totalPages: 1,
  };

  beforeEach(async () => {
    service = {
      addToCart: jest.fn().mockResolvedValue(mockCartResponse),
      getCart: jest.fn().mockResolvedValue(mockCartResponse),
      updateCartItem: jest.fn().mockResolvedValue(mockCartResponse),
      removeCartItem: jest.fn().mockResolvedValue({
        success: true,
        message: 'Cart item removed successfully',
      }),
      clearCart: jest.fn().mockResolvedValue({
        success: true,
        message: 'Cart cleared successfully',
      }),
      checkout: jest.fn().mockResolvedValue({
        paymentId: 501,
        paymentUrl: 'https://rzp.io/i/test123',
        amount: 998,
        amountInPaise: 99800,
        currency: 'INR',
        bookingId: null,
        status: PAYMENT_STATUS.CREATED,
        items: [
          {
            productId: 10,
            productName: 'Puja Thali',
            unitPrice: 499,
            quantity: 2,
            total: 998,
          },
        ],
      }),
    } as unknown as jest.Mocked<CartService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: service }],
    }).compile();

    controller = module.get<CartController>(CartController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /cart/items should add to cart and return formatted cart', async () => {
    const res = await controller.addToCart({ user: customerUser } as any, {
      productId: 10,
      quantity: 2,
    });
    expect(service.addToCart).toHaveBeenCalledWith(customerUser, {
      productId: 10,
      quantity: 2,
    });
    expect(res.success).toBe(true);
    expect(res.data.total).toBe(998);
  });

  it('GET /cart should return customer cart with pagination and optional search filter', async () => {
    const query = { page: 1, limit: 10, search: 'Puja' };
    const res = await controller.getCart(
      { user: customerUser } as any,
      query,
    );
    expect(service.getCart).toHaveBeenCalledWith(customerUser, query);
    expect(res.success).toBe(true);
    expect(res.data.items).toHaveLength(1);
    expect(res.data.page).toBe(1);
    expect(res.data.limit).toBe(10);
    expect(res.data.totalItems).toBe(1);
  });

  it('PATCH /cart/items/:itemId should update item quantity', async () => {
    const res = await controller.updateCartItem(
      { user: customerUser } as any,
      201,
      { quantity: 3 },
    );
    expect(service.updateCartItem).toHaveBeenCalledWith(customerUser, 201, {
      quantity: 3,
    });
    expect(res.success).toBe(true);
  });

  it('DELETE /cart/items/:itemId should remove cart item', async () => {
    const res = await controller.removeCartItem(
      { user: customerUser } as any,
      201,
    );
    expect(service.removeCartItem).toHaveBeenCalledWith(customerUser, 201);
    expect(res.success).toBe(true);
  });

  it('DELETE /cart should clear customer cart', async () => {
    const res = await controller.clearCart({ user: customerUser } as any);
    expect(service.clearCart).toHaveBeenCalledWith(customerUser);
    expect(res.success).toBe(true);
  });

  it('POST /cart/checkout should initiate checkout', async () => {
    const res = await controller.checkout({ user: customerUser } as any, {
      bookingId: 10,
    });
    expect(service.checkout).toHaveBeenCalledWith(customerUser, {
      bookingId: 10,
    });
    expect(res.success).toBe(true);
    expect(res.data.paymentUrl).toBe('https://rzp.io/i/test123');
  });
});
