import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentService } from '../../../payment-service/src/payment/payment.service';
import {
  Booking,
  BOOKING_STATUS,
  BookingProduct,
  Cart,
  CartItem,
  CUSTOMER_PAYMENT_METHOD,
  Order,
  OrderItem,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  Payment,
  Product,
  ShippingAddressSnapshot,
  User,
  USER_ROLE,
  ACTOR_TYPE,
  AUDIT_MODULE,
  NOTIFICATION_TYPE,
} from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { NotificationService } from '@poojawala/notification';
import { EmailService, renderPoojawalaEmail } from '@poojawala/email-services';
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
  AddToCartDto,
  CheckoutDto,
  GetCartQueryDto,
  UpdateCartItemDto,
} from '@poojawala/dtos';
import { S3Service } from '@poojawala/s3';

export interface FormattedCartItem {
  id: number;
  productId: number;
  name: string;
  imageUrl?: string | null;
  pricingUnit?: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface FormattedCartResponse {
  id: number;
  customerId: number;
  items: FormattedCartItem[];
  total: number;
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface CheckoutResponse {
  orderId: number;
  orderNumber: string;
  customerId?: number | null;
  paymentId: number;
  paymentUrl: string | null;
  amount: number;
  amountInPaise: number;
  currency: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: ORDER_PAYMENT_METHOD;
  paymentStatus: ORDER_PAYMENT_STATUS;
  orderStatus: ORDER_STATUS;
  shippingAddressSnapshot: ShippingAddressSnapshot;
  items: {
    id?: number;
    productId: number | null;
    productName: string;
    productImage?: string | null;
    unitPrice: number;
    quantity: number;
    total: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
  status?: PAYMENT_STATUS;
  bookingId?: number | null;
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly cartItemRepository: CartItemRepository,
    private readonly productRepository: ProductRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly bookingProductRepository: BookingProductRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly customerAddressRepository: CustomerAddressRepository,
    private readonly dataSource: DataSource,
    private readonly paymentService: PaymentService,
    @Optional() private readonly s3Service?: S3Service,
    @Optional() private readonly auditLogService?: AuditLogService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly emailService?: EmailService,
  ) { }

  /**
   * Helper to format cart items with dynamic, DB-sourced prices.
   * Frontend input prices are never trusted.
   */
  private async formatCartItems(
    items: CartItem[],
  ): Promise<FormattedCartItem[]> {
    const formatted: FormattedCartItem[] = [];

    for (const item of items) {
      if (!item.product || !item.product.isActive || item.product.deletedAt) {
        // Skip inactive/deleted products
        continue;
      }

      let imageUrl = item.product.imageUrl;
      if (imageUrl && this.s3Service) {
        try {
          imageUrl = await this.s3Service.getDownloadUrl(imageUrl);
        } catch {
          // Retain raw imageUrl if presigning fails
        }
      }

      const unitPrice = Number(item.product.price);
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));

      formatted.push({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        imageUrl: imageUrl || null,
        pricingUnit: item.product.pricingUnit || null,
        unitPrice,
        quantity: item.quantity,
        subtotal,
      });
    }

    return formatted;
  }

  /**
   * Adds a product to the authenticated customer's cart.
   * If the product already exists in the cart, its quantity is increased.
   */
  async addToCart(
    user: User,
    dto: AddToCartDto,
  ): Promise<FormattedCartResponse> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can manage a cart');
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    const product = await this.productRepository.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive || product.deletedAt) {
      throw new BadRequestException(
        'Product is currently unavailable for purchase',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const cartRepo = manager.getRepository(Cart);
      const cartItemRepo = manager.getRepository(CartItem);

      let cart = await cartRepo.findOne({
        where: { customerId: user.id },
      });

      if (!cart) {
        cart = cartRepo.create({ customerId: user.id });
        cart = await cartRepo.save(cart);
      }

      // Concurrency lock on cart to avoid duplicate CartItems
      const existingItem = await cartItemRepo.findOne({
        where: { cartId: cart.id, productId: product.id },
      });

      if (existingItem) {
        existingItem.quantity += dto.quantity;
        await cartItemRepo.save(existingItem);
      } else {
        const newItem = cartItemRepo.create({
          cartId: cart.id,
          productId: product.id,
          quantity: dto.quantity,
        });
        await cartItemRepo.save(newItem);
      }
    });

    return this.getCart(user);
  }

  /**
   * Returns the authenticated customer's cart with up-to-date DB prices,
   * pagination, and optional product search filter.
   */
  async getCart(
    user: User,
    query?: GetCartQueryDto,
  ): Promise<FormattedCartResponse> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can access a cart');
    }

    // Ensure customer cart exists
    const cart = await this.cartRepository.findOrCreateCart(user.id);

    const page = query?.page && Number(query.page) > 0 ? Number(query.page) : 1;
    const limit =
      query?.limit && Number(query.limit) > 0 ? Number(query.limit) : 10;

    const { items, totalItems } =
      await this.cartItemRepository.findCartItemsWithPagination(cart.id, query);

    // Calculate total from all valid matching items across all pages
    const allMatchingItems =
      await this.cartItemRepository.findAllValidItemsByCartId(
        cart.id,
        query?.search,
      );

    let total = 0;
    for (const item of allMatchingItems) {
      if (item.product && item.product.isActive && !item.product.deletedAt) {
        const unitPrice = Number(item.product.price);
        const subtotal = Number((unitPrice * item.quantity).toFixed(2));
        total = Number((total + subtotal).toFixed(2));
      }
    }

    const formattedItems = await this.formatCartItems(items);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

    return {
      id: cart.id,
      customerId: cart.customerId,
      items: formattedItems,
      total,
      page,
      limit,
      totalItems,
      totalPages,
    };
  }

  /**
   * Updates the quantity of a specific cart item.
   * Verifies item ownership to prevent horizontal privilege escalation.
   */
  async updateCartItem(
    user: User,
    itemId: number,
    dto: UpdateCartItemDto,
  ): Promise<FormattedCartResponse> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can update cart items');
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    const item = await this.cartItemRepository.findOne({
      where: { id: itemId },
      relations: ['cart', 'product'],
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    // Horizontal privilege escalation check
    if (item.cart.customerId !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to modify this cart item',
      );
    }

    if (!item.product || !item.product.isActive || item.product.deletedAt) {
      throw new BadRequestException('Product is no longer available');
    }

    item.quantity = dto.quantity;
    await this.cartItemRepository.save(item);

    return this.getCart(user);
  }

  /**
   * Removes a single cart item after verifying customer ownership.
   */
  async removeCartItem(
    user: User,
    itemId: number,
  ): Promise<{ success: boolean; message: string }> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can remove cart items');
    }

    const item = await this.cartItemRepository.findOne({
      where: { id: itemId },
      relations: ['cart'],
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    // Horizontal privilege escalation check
    if (item.cart.customerId !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to delete this cart item',
      );
    }

    await this.cartItemRepository.delete(itemId);

    return {
      success: true,
      message: 'Cart item removed successfully',
    };
  }

  /**
   * Clears all items from the customer's cart.
   * Does NOT delete user, cart container, or unrelated customer data.
   */
  async clearCart(user: User): Promise<{ success: boolean; message: string }> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can clear their cart');
    }

    const cart = await this.cartRepository.findOne({
      where: { customerId: user.id },
    });

    if (cart) {
      await this.cartItemRepository.removeByCartId(cart.id);
    }

    return {
      success: true,
      message: 'Cart cleared successfully',
    };
  }

  /**
   * Initiates checkout for the items in the customer's cart or retries payment for an existing unpaid order.
   *
   * Flow:
   * 1. If dto.orderId is provided:
   *    - Verify order exists, belongs to user, and is not already paid.
   *    - Create a new Payment record in DB transaction and link to existing order.
   *    - Outside DB transaction, create Razorpay Payment Link and return.
   * 2. If new checkout (no orderId):
   *    - Validate cart items & active products from DB.
   *    - Calculate totals (frontend prices are never trusted).
   *    - Resolve shipping address (from dto.shippingAddress, dto.addressId, or customer default address).
   *    - In DB transaction: Create Payment, Order, and OrderItems. If COD, clear cart.
   *    - Outside DB transaction: If ONLINE, generate Razorpay payment link. If COD, confirm immediately.
   */
  async checkout(user: User, dto: CheckoutDto): Promise<CheckoutResponse> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can checkout a cart');
    }

    // ==========================================
    // 1. PAYMENT RETRY FLOW
    // ==========================================
    if (dto.orderId) {
      const existingOrder = await this.orderRepository.findCustomerOrderById(
        user.id,
        dto.orderId,
      );

      if (!existingOrder) {
        throw new NotFoundException(`Order #${dto.orderId} not found`);
      }

      if (existingOrder.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
        throw new BadRequestException('This order has already been paid');
      }

      if (existingOrder.orderStatus === ORDER_STATUS.CANCELLED) {
        throw new BadRequestException(
          'Cannot retry payment for a cancelled order',
        );
      }

      const totalAmount = Number(existingOrder.totalAmount);
      const amountInPaise = Math.round(totalAmount * 100);

      const savedPayment = await this.dataSource.transaction(
        async (manager) => {
          const paymentRepo = manager.getRepository(Payment);
          const orderRepo = manager.getRepository(Order);

          const payment = paymentRepo.create({
            paymentType: PAYMENT_TYPE.PRODUCT_PAYMENT,
            createdById: user.id,
            payerId: user.id,
            amount: totalAmount,
            currency: 'INR',
            customerPaymentMethod: CUSTOMER_PAYMENT_METHOD.ONLINE,
            status: PAYMENT_STATUS.CREATED,
            remark: `Payment retry for Order #${existingOrder.orderNumber}`,
          });

          const newPayment = await paymentRepo.save(payment);

          existingOrder.paymentId = newPayment.id;
          existingOrder.paymentStatus = ORDER_PAYMENT_STATUS.PENDING;
          await orderRepo.save(existingOrder);

          return newPayment;
        },
      );

      const customerName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        'Customer';

      try {
        const paymentLink = await this.paymentService.createRazorpayPaymentLink(
          savedPayment,
          null,
          {
            name: customerName,
            ...(user.email ? { email: user.email } : {}),
            ...(user.phone ? { contact: user.phone } : {}),
          },
          `Poojawala Order #${existingOrder.orderNumber}`,
          {
            paymentId: String(savedPayment.id),
            customerId: String(user.id),
            orderId: String(existingOrder.id),
            orderNumber: existingOrder.orderNumber,
            paymentType: String(savedPayment.paymentType),
            isCartCheckout: 'true',
          },
        );

        return {
          orderId: existingOrder.id,
          orderNumber: existingOrder.orderNumber,
          customerId: existingOrder.customerId,
          paymentId: savedPayment.id,
          paymentUrl: paymentLink.short_url,
          amount: totalAmount,
          amountInPaise,
          currency: 'INR',
          subtotal: Number(existingOrder.subtotal),
          discountAmount: Number(existingOrder.discountAmount),
          totalAmount,
          paymentMethod: existingOrder.paymentMethod,
          paymentStatus: existingOrder.paymentStatus,
          orderStatus: existingOrder.orderStatus,
          shippingAddressSnapshot: existingOrder.shippingAddressSnapshot,
          items: await Promise.all(
            (existingOrder.items || []).map(async (item) => {
              let img =
                item.productImageSnapshot || item.product?.imageUrl || null;
              if (img && this.s3Service) {
                try {
                  img = await this.s3Service.getDownloadUrl(img);
                } catch {
                  // retain
                }
              }
              return {
                id: item.id,
                productId: item.productId ?? null,
                productName: item.productNameSnapshot,
                productImage: img,
                pricingUnit: item.product?.pricingUnit || 'PIECE',
                unitPrice: Number(item.unitPriceSnapshot),
                quantity: item.quantity,
                total: Number(item.totalAmount),
              };
            }),
          ),
          createdAt: existingOrder.createdAt,
          updatedAt: existingOrder.updatedAt,
          status: savedPayment.status,
        };
      } catch (error: unknown) {
        if (error instanceof HttpException) {
          throw error;
        }

        const errorMessage =
          (error as { message?: string })?.message ||
          'Razorpay payment link creation failed';

        savedPayment.status = PAYMENT_STATUS.FAILED;
        savedPayment.failureReason = errorMessage;
        await this.paymentRepository.savePayment(savedPayment);

        existingOrder.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
        await this.orderRepository.save(existingOrder);

        this.logger.error(
          `Failed to create Razorpay payment link for payment #${savedPayment.id}: ${errorMessage}`,
        );

        throw new BadRequestException(errorMessage);
      }
    }

    // ==========================================
    // 2. NEW CART CHECKOUT FLOW
    // ==========================================
    const cart = await this.cartRepository.findCartWithItems(user.id);

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cannot checkout an empty cart');
    }

    // Validate active products and calculate totals
    const validItems: {
      product: Product;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];

    let totalAmount = 0;

    for (const item of cart.items) {
      if (!item.product || !item.product.isActive || item.product.deletedAt) {
        throw new BadRequestException(
          `Product #${item.productId} is no longer available for purchase. Please update your cart.`,
        );
      }

      const unitPrice = Number(item.product.price);
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));
      totalAmount = Number((totalAmount + subtotal).toFixed(2));

      validItems.push({
        product: item.product,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      });
    }

    if (validItems.length === 0 || totalAmount <= 0) {
      throw new BadRequestException('No valid products to checkout');
    }

    // Resolve Shipping Address Snapshot
    let resolvedAddress: ShippingAddressSnapshot;

    if (dto.shippingAddress) {
      resolvedAddress = {
        name: dto.shippingAddress.name,
        phone: dto.shippingAddress.phone,
        addressLine1: dto.shippingAddress.addressLine1,
        addressLine2: dto.shippingAddress.addressLine2,
        city: dto.shippingAddress.city,
        state: dto.shippingAddress.state,
        pincode: dto.shippingAddress.pincode,
      };
    } else if (dto.addressId) {
      const address = await this.customerAddressRepository.findOne({
        where: { id: dto.addressId, customerId: user.id },
      });
      if (!address) {
        throw new NotFoundException('Address not found');
      }
      resolvedAddress = {
        name:
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          'Customer',
        phone: user.phone || '',
        addressLine1: address.fullAddress,
        addressLine2: address.addressLabel,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      };
    } else {
      let address = await this.customerAddressRepository.findOne({
        where: { customerId: user.id, isDefault: true },
      });
      if (!address) {
        address = await this.customerAddressRepository.findOne({
          where: { customerId: user.id },
          order: { createdAt: 'DESC' },
        });
      }
      if (!address) {
        throw new BadRequestException(
          'Shipping address is required. Please provide a shipping address or select a saved address.',
        );
      }
      resolvedAddress = {
        name:
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          'Customer',
        phone: user.phone || '',
        addressLine1: address.fullAddress,
        addressLine2: address.addressLabel,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      };
    }

    const paymentMethod = dto.paymentMethod || ORDER_PAYMENT_METHOD.ONLINE;
    const isCod = paymentMethod === ORDER_PAYMENT_METHOD.COD;

    // Inside DB transaction: Create Payment, Order, OrderItems (and clear cart if COD)
    const { savedPayment, savedOrder } = await this.dataSource.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(Payment);
        const orderRepo = manager.getRepository(Order);
        const orderItemRepo = manager.getRepository(OrderItem);
        const cartItemRepo = manager.getRepository(CartItem);

        const payment = paymentRepo.create({
          paymentType: PAYMENT_TYPE.PRODUCT_PAYMENT,
          createdById: user.id,
          payerId: user.id,
          amount: totalAmount,
          currency: 'INR',
          customerPaymentMethod: isCod
            ? CUSTOMER_PAYMENT_METHOD.CASH
            : CUSTOMER_PAYMENT_METHOD.ONLINE,
          status: isCod ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.CREATED,
          remark: `Product purchase Order - ${paymentMethod}`,
        });

        const newPayment = await paymentRepo.save(payment);

        const timestamp = Date.now().toString().slice(-6);
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `PW-ORD-${timestamp}-${randomPart}`;

        const order = orderRepo.create({
          orderNumber,
          customerId: user.id,
          subtotal: totalAmount,
          discountAmount: 0,
          totalAmount: totalAmount,
          paymentId: newPayment.id,
          paymentMethod,
          paymentStatus: isCod
            ? ORDER_PAYMENT_STATUS.COD_PENDING
            : ORDER_PAYMENT_STATUS.PENDING,
          orderStatus: isCod
            ? ORDER_STATUS.CONFIRMED
            : ORDER_STATUS.PENDING_PAYMENT,
          shippingAddressSnapshot: resolvedAddress,
        });

        const newOrder = await orderRepo.save(order);

        const createdItems: OrderItem[] = [];
        for (const validItem of validItems) {
          let imageUrl: string | null = validItem.product.imageUrl || null;
          if (imageUrl && this.s3Service) {
            try {
              imageUrl = await this.s3Service.getDownloadUrl(imageUrl);
            } catch {
              // retain raw imageUrl if presigning fails
            }
          }

          const orderItem = orderItemRepo.create({
            orderId: newOrder.id,
            productId: validItem.product.id,
            productNameSnapshot: validItem.product.name,
            productImageSnapshot: imageUrl,
            unitPriceSnapshot: validItem.unitPrice,
            quantity: validItem.quantity,
            totalAmount: validItem.subtotal,
          });
          createdItems.push(orderItem);
        }

        await orderItemRepo.save(createdItems);
        newOrder.items = createdItems;

        // If COD: Clear cart immediately inside transaction
        if (isCod) {
          await cartItemRepo.delete({ cartId: cart.id });
        }

        return { savedPayment: newPayment, savedOrder: newOrder };
      },
    );

    const amountInPaise = Math.round(totalAmount * 100);

    // COD Checkout: No Razorpay call
    if (isCod) {
      await this.notifyAndEmailOrderPlaced(user, savedOrder, true, null);

      return {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        customerId: savedOrder.customerId,
        paymentId: savedPayment.id,
        paymentUrl: null,
        amount: totalAmount,
        amountInPaise,
        currency: 'INR',
        subtotal: Number(savedOrder.subtotal),
        discountAmount: Number(savedOrder.discountAmount),
        totalAmount,
        paymentMethod: savedOrder.paymentMethod,
        paymentStatus: savedOrder.paymentStatus,
        orderStatus: savedOrder.orderStatus,
        shippingAddressSnapshot: savedOrder.shippingAddressSnapshot,
        items: (savedOrder.items || []).map((item) => ({
          id: item.id,
          productId: item.productId ?? null,
          productName: item.productNameSnapshot,
          productImage: item.productImageSnapshot ?? null,
          unitPrice: Number(item.unitPriceSnapshot),
          quantity: item.quantity,
          total: Number(item.totalAmount),
        })),
        createdAt: savedOrder.createdAt,
        updatedAt: savedOrder.updatedAt,
        status: savedPayment.status,
      };
    }

    // ONLINE Checkout: Create Razorpay payment link outside DB transaction
    const customerName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      'Customer';

    try {
      const paymentLink = await this.paymentService.createRazorpayPaymentLink(
        savedPayment,
        null,
        {
          name: customerName,
          ...(user.email ? { email: user.email } : {}),
          ...(user.phone ? { contact: user.phone } : {}),
        },
        `Poojawala Order #${savedOrder.orderNumber}`,
        {
          paymentId: String(savedPayment.id),
          customerId: String(user.id),
          orderId: String(savedOrder.id),
          orderNumber: savedOrder.orderNumber,
          paymentType: String(savedPayment.paymentType),
          isCartCheckout: 'true',
        },
      );

      await this.notifyAndEmailOrderPlaced(
        user,
        savedOrder,
        false,
        paymentLink.short_url,
      );

      return {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        customerId: savedOrder.customerId,
        paymentId: savedPayment.id,
        paymentUrl: paymentLink.short_url,
        amount: totalAmount,
        amountInPaise,
        currency: 'INR',
        subtotal: Number(savedOrder.subtotal),
        discountAmount: Number(savedOrder.discountAmount),
        totalAmount,
        paymentMethod: savedOrder.paymentMethod,
        paymentStatus: savedOrder.paymentStatus,
        orderStatus: savedOrder.orderStatus,
        shippingAddressSnapshot: savedOrder.shippingAddressSnapshot,
        items: (savedOrder.items || []).map((item) => ({
          id: item.id,
          productId: item.productId ?? null,
          productName: item.productNameSnapshot,
          productImage: item.productImageSnapshot ?? null,
          unitPrice: Number(item.unitPriceSnapshot),
          quantity: item.quantity,
          total: Number(item.totalAmount),
        })),
        createdAt: savedOrder.createdAt,
        updatedAt: savedOrder.updatedAt,
        status: savedPayment.status,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage =
        (error as { message?: string })?.message ||
        'Razorpay payment link creation failed';

      // Mark payment as failed if Razorpay creation failed
      savedPayment.status = PAYMENT_STATUS.FAILED;
      savedPayment.failureReason = errorMessage;
      await this.paymentRepository.savePayment(savedPayment);

      savedOrder.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
      await this.orderRepository.save(savedOrder);

      // Audit and notify payment link failure
      if (this.auditLogService) {
        try {
          await this.auditLogService.createAuditLog({
            actorId: user.id,
            actorType: ACTOR_TYPE.USER,
            actorRole: user.role,
            module: AUDIT_MODULE.PAYMENT,
            entity: 'Payment',
            entityId: String(savedPayment.id),
            action: 'PAYMENT_FAILED',
            message: `Razorpay payment link creation failed for Order #${savedOrder.orderNumber}: ${errorMessage}`,
            oldValue: { status: PAYMENT_STATUS.PENDING },
            newValue: { status: PAYMENT_STATUS.FAILED, failureReason: errorMessage },
            metadata: { orderId: savedOrder.id, orderNumber: savedOrder.orderNumber },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to create payment failure audit: ${err?.message}`);
        }
      }

      if (this.notificationService) {
        try {
          await this.notificationService.createNotification(
            user.id,
            'Payment Failed',
            `Payment link creation failed for Order #${savedOrder.orderNumber}. Please retry checkout.`,
            NOTIFICATION_TYPE.PAYMENT,
            savedOrder.id,
            'ORDER',
          );
        } catch (err: any) {
          this.logger.warn(`Failed to send payment failure notification: ${err?.message}`);
        }
      }

      this.logger.error(
        `Failed to create Razorpay payment link for payment #${savedPayment.id}: ${errorMessage}`,
      );

      throw new BadRequestException(errorMessage);
    }
  }

  /**
   * Helper to safely send audit, notification, and email for newly placed orders.
   * Transaction is already committed before this is called.
   */
  private async notifyAndEmailOrderPlaced(
    user: User,
    order: Order,
    isCod: boolean,
    paymentUrl?: string | null,
  ): Promise<void> {
    // 1. Audit Log: ORDER_CREATED
    if (this.auditLogService) {
      try {
        await this.auditLogService.createAuditLog({
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.PRODUCT,
          entity: 'Order',
          entityId: String(order.id),
          action: 'ORDER_CREATED',
          message: `Order #${order.orderNumber} created with payment method ${isCod ? 'COD' : 'ONLINE'}.`,
          oldValue: undefined,
          newValue: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            orderStatus: order.orderStatus,
          },
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerId: user.id,
            paymentMethod: isCod ? 'COD' : 'ONLINE',
            totalAmount: order.totalAmount,
            paymentUrl: paymentUrl || undefined,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to create order audit log: ${err?.message}`);
      }
    }

    // 2. Notification to customer
    if (this.notificationService) {
      try {
        const title = isCod ? 'Order Placed (COD)' : 'Order Placed - Payment Pending';
        const message = isCod
          ? `Your order #${order.orderNumber} for ₹${order.totalAmount} has been placed successfully via Cash on Delivery.`
          : `Your order #${order.orderNumber} for ₹${order.totalAmount} has been created. Please complete payment to confirm.`;

        await this.notificationService.createNotification(
          user.id,
          title,
          message,
          NOTIFICATION_TYPE.SYSTEM,
          order.id,
          'ORDER',
        );
      } catch (err: any) {
        this.logger.warn(`Failed to send order notification: ${err?.message}`);
      }
    }

    // 3. Email to customer
    if (user.email && this.emailService) {
      try {
        const customerName =
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          'Devotee';
        const statusBadge = isCod
          ? 'Order Confirmed (COD)'
          : 'Order Created (Pending Payment)';
        const emailMessage = isCod
          ? `Thank you for your order! Your order <strong>#${order.orderNumber}</strong> has been placed under <strong>Cash on Delivery</strong>.`
          : `Thank you for your order! Your order <strong>#${order.orderNumber}</strong> has been created. Please complete your payment using the link below to confirm.`;

        const html = renderPoojawalaEmail({
          statusBadge,
          userName: customerName,
          preheaderText: `Order #${order.orderNumber} created!`,
          emailMessage,
          detailsTable: {
            title: 'Order Details',
            rows: [
              { label: 'Order Number', value: `#${order.orderNumber}` },
              {
                label: 'Payment Method',
                value: isCod ? 'Cash on Delivery (COD)' : 'Online Payment',
              },
              {
                label: 'Payment Status',
                value: isCod ? 'COD Pending' : 'Pending',
                isHighlight: true,
              },
              {
                label: 'Delivery Address',
                value: order.shippingAddressSnapshot
                  ? `${order.shippingAddressSnapshot.addressLine1}, ${order.shippingAddressSnapshot.city} - ${order.shippingAddressSnapshot.pincode}`
                  : 'Saved Address',
              },
            ],
            totalRow: {
              label: 'Total Amount',
              value: `₹${order.totalAmount}`,
            },
          },
          highlight: isCod
            ? {
                title: 'Cash on Delivery',
                text: `Please keep ₹${order.totalAmount} ready in cash at the time of delivery.`,
              }
            : paymentUrl
            ? {
                title: 'Complete Your Payment',
                text: `Click the payment link or copy to browser: ${paymentUrl}`,
              }
            : undefined,
        });

        await this.emailService.sendMail({
          to: user.email,
          subject: isCod
            ? `Order Confirmed - Poojawala | Order #${order.orderNumber}`
            : `Complete Payment for Order #${order.orderNumber} - Poojawala`,
          html,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send order email: ${err?.message}`);
      }
    }
  }
}
