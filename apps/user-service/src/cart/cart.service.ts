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
import Razorpay from 'razorpay';
import {
  Booking,
  BOOKING_STATUS,
  BookingProduct,
  Cart,
  CartItem,
  CUSTOMER_PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  Payment,
  Product,
  User,
  USER_ROLE,
} from '@poojawala/entities';
import {
  BookingProductRepository,
  BookingRepository,
  CartItemRepository,
  CartRepository,
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
  paymentId: number;
  paymentUrl: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  bookingId?: number | null;
  status: PAYMENT_STATUS;
  items: {
    productId: number;
    productName: string;
    unitPrice: number;
    quantity: number;
    total: number;
  }[];
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private readonly razorpay: Razorpay;

  constructor(
    private readonly cartRepository: CartRepository,
    private readonly cartItemRepository: CartItemRepository,
    private readonly productRepository: ProductRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly bookingProductRepository: BookingProductRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly dataSource: DataSource,
    @Optional() private readonly s3Service?: S3Service,
  ) {
    const keyId = process.env['RAZORPAY_KEY_ID'] || 'rzp_test_placeholder';
    const keySecret =
      process.env['RAZORPAY_KEY_SECRET'] || 'placeholder_secret';

    if (
      !process.env['RAZORPAY_KEY_ID'] ||
      !process.env['RAZORPAY_KEY_SECRET']
    ) {
      this.logger.warn(
        'Razorpay credentials are not fully configured in environment',
      );
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

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
   * Initiates checkout for the items in the customer's cart.
   *
   * Flow:
   * 1. Validate cart has items and products are active.
   * 2. Recalculate price from DB (frontend prices never trusted).
   * 3. If bookingId provided, validate booking belongs to customer & is active.
   * 4. In a DB transaction: Create BookingProduct snapshots and Payment record.
   * 5. Outside DB transaction: Create Razorpay payment link (external call).
   * 6. Update payment with Razorpay link ID and return payment information.
   * 7. Cart is NOT cleared here; it will be cleared upon confirmed payment.
   */
  async checkout(user: User, dto: CheckoutDto): Promise<CheckoutResponse> {
    if (user.role !== USER_ROLE.CUSTOMER) {
      throw new ForbiddenException('Only customers can checkout a cart');
    }

    const cart = await this.cartRepository.findCartWithItems(user.id);

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cannot checkout an empty cart');
    }

    // Filter valid products and calculate latest total
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

    let booking: Booking | null = null;
    if (dto.bookingId) {
      booking = await this.bookingRepository.findOne({
        where: { id: dto.bookingId },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.customerId !== user.id) {
        throw new ForbiddenException('You do not own this booking');
      }

      if (booking.status === BOOKING_STATUS.CANCELLED) {
        throw new BadRequestException(
          'Cannot attach products to a cancelled booking',
        );
      }
    }

    // Step A: Database transaction for creating BookingProduct snapshots and Payment record
    const { savedPayment, snapshots } = await this.dataSource.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(Payment);
        const bookingProductRepo = manager.getRepository(BookingProduct);

        const payment = paymentRepo.create({
          paymentType: PAYMENT_TYPE.BOOKING_PAYMENT,
          bookingId: booking ? booking.id : undefined,
          createdById: user.id,
          payerId: user.id,
          amount: totalAmount,
          currency: 'INR',
          customerPaymentMethod: CUSTOMER_PAYMENT_METHOD.ONLINE,
          status: PAYMENT_STATUS.CREATED,
          remark: booking
            ? `Product purchase for Booking #${booking.bookingNumber}`
            : 'Cart product purchase',
        });

        const newPayment = await paymentRepo.save(payment);

        const createdSnapshots: {
          productId: number;
          productName: string;
          unitPrice: number;
          quantity: number;
          total: number;
        }[] = [];
        for (const validItem of validItems) {
          const bp = bookingProductRepo.create({
            bookingId: booking ? booking.id : null,
            customerId: user.id,
            paymentId: newPayment.id,
            productId: validItem.product.id,
            productNameSnapshot: validItem.product.name,
            unitPriceSnapshot: validItem.unitPrice,
            quantity: validItem.quantity,
            total: validItem.subtotal,
          });

          const savedBp = await bookingProductRepo.save(bp);
          createdSnapshots.push({
            productId: savedBp.productId,
            productName: savedBp.productNameSnapshot,
            unitPrice: Number(savedBp.unitPriceSnapshot),
            quantity: savedBp.quantity,
            total: Number(savedBp.total),
          });
        }

        return { savedPayment: newPayment, snapshots: createdSnapshots };
      },
    );

    // Step B: External Razorpay Payment Link creation (outside DB transaction)
    const amountInPaise = Math.round(totalAmount * 100);
    const customerName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Customer';

    try {
      const paymentLink = await this.razorpay.paymentLink.create({
        amount: amountInPaise,
        currency: 'INR',
        accept_partial: false,
        description: booking
          ? `Payment for items attached to Booking #${booking.bookingNumber}`
          : `Poojawala Product Purchase #${savedPayment.id}`,
        customer: {
          name: customerName,
          ...(user.email ? { email: user.email } : {}),
          ...(user.phone ? { contact: user.phone } : {}),
        },
        notify: {
          sms: Boolean(user.phone),
          email: Boolean(user.email),
        },
        reminder_enable: true,
        reference_id: `payment_${savedPayment.id}`,
        notes: {
          paymentId: String(savedPayment.id),
          bookingId: String(booking?.id ?? ''),
          bookingNumber: booking?.bookingNumber ?? '',
          customerId: String(user.id),
          isCartCheckout: 'true',
        },
        ...(dto.callbackUrl
          ? {
            callback_url: dto.callbackUrl,
            callback_method: 'get' as const,
          }
          : {}),
      } as unknown as Parameters<Razorpay['paymentLink']['create']>[0]);

      if (!paymentLink?.id || !paymentLink?.short_url) {
        throw new InternalServerErrorException(
          'Invalid payment-link response received from Razorpay',
        );
      }

      savedPayment.razorpayPaymentLinkId = paymentLink.id;
      await this.paymentRepository.savePayment(savedPayment);

      return {
        paymentId: savedPayment.id,
        paymentUrl: paymentLink.short_url,
        amount: totalAmount,
        amountInPaise,
        currency: 'INR',
        bookingId: booking?.id ?? null,
        status: savedPayment.status,
        items: snapshots,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      const razorpayErr = error as {
        message?: string;
        error?: { description?: string };
      };
      const errorMessage =
        razorpayErr?.error?.description ||
        razorpayErr?.message ||
        'Razorpay payment link creation failed';

      // Mark payment as failed if Razorpay creation failed
      savedPayment.status = PAYMENT_STATUS.FAILED;
      savedPayment.failureReason = errorMessage;
      await this.paymentRepository.savePayment(savedPayment);

      this.logger.error(
        `Failed to create Razorpay payment link for payment #${savedPayment.id}: ${errorMessage}`,
      );

      throw new BadRequestException(errorMessage);
    }
  }
}
