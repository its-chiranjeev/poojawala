import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Order,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
  Payment,
  PAYMENT_STATUS,
  User,
  USER_ROLE,
} from '@poojawala/entities';
import { OrderRepository } from '@poojawala/repositories';
import {
  CollectCodPaymentDto,
  GetOrdersQueryDto,
  UpdateOrderStatusDto,
} from '@poojawala/dtos';
import { S3Service } from '@poojawala/s3';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly dataSource: DataSource,
    @Optional() private readonly s3Service?: S3Service,
  ) { }

  /**
   * Helper to ensure productImageSnapshot has a fresh S3 presigned downloadUrl
   * and pricingUnit is populated on every order item.
   */
  private async formatOrder(order: Order): Promise<Order> {
    if (order && order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        let img = item.productImageSnapshot || item.product?.imageUrl || null;
        if (img && this.s3Service) {
          try {
            img = await this.s3Service.getDownloadUrl(img);
          } catch {
            // retain existing if presigning fails
          }
        }
        item.productImageSnapshot = img;
      }
    }
    return order;
  }

  /**
   * Retrieves orders based on role:
   * - CUSTOMER: returns only their own orders
   * - ADMIN: returns all orders with filters
   */
  async getOrders(user: User, query: GetOrdersQueryDto) {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.max(Number(query.limit || 10), 1);

    if (user.role === USER_ROLE.CUSTOMER) {
      const { orders, total } = await this.orderRepository.findCustomerOrders(
        user.id,
        query,
      );
      const formattedOrders = await Promise.all(
        orders.map((o) => this.formatOrder(o)),
      );
      return {
        orders: formattedOrders,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    if (user.role === USER_ROLE.ADMIN) {
      const { orders, total } = await this.orderRepository.findAllOrdersAdmin(
        query,
      );
      const formattedOrders = await Promise.all(
        orders.map((o) => this.formatOrder(o)),
      );
      return {
        orders: formattedOrders,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    throw new ForbiddenException('You do not have permission to view orders');
  }

  /**
   * Retrieves a single order by ID:
   * - CUSTOMER: can access only their own order
   * - ADMIN: can access any order
   */
  async getOrderById(user: User, orderId: number): Promise<Order> {
    let order: Order | null = null;

    if (user.role === USER_ROLE.CUSTOMER) {
      order = await this.orderRepository.findCustomerOrderById(
        user.id,
        orderId,
      );
    } else if (user.role === USER_ROLE.ADMIN) {
      order = await this.orderRepository.findOrderByIdWithDetails(orderId);
    } else {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    return this.formatOrder(order);
  }

  /**
   * Updates fulfillment status (ADMIN ONLY)
   */
  async updateOrderStatus(
    user: User,
    orderId: number,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    if (user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException('Only administrators can update order status');
    }

    const order = await this.orderRepository.findOrderByIdWithDetails(orderId);

    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    order.orderStatus = dto.status;
    return this.orderRepository.save(order);
  }

  /**
   * Marks COD payment as collected (ADMIN ONLY)
   */
  async collectCodPayment(
    user: User,
    orderId: number,
    dto?: CollectCodPaymentDto,
  ): Promise<Order> {
    if (user.role !== USER_ROLE.ADMIN) {
      throw new ForbiddenException(
        'Only administrators can mark COD payment as collected',
      );
    }

    const order = await this.orderRepository.findOrderByIdWithDetails(orderId);

    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    if (order.paymentMethod !== ORDER_PAYMENT_METHOD.COD) {
      throw new BadRequestException(
        `Order #${order.orderNumber} is not a Cash on Delivery (COD) order`,
      );
    }

    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
      throw new BadRequestException(
        `Order #${order.orderNumber} has already been marked as paid`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const paymentRepo = manager.getRepository(Payment);

      if (order.paymentId) {
        const payment = await paymentRepo.findOne({
          where: { id: order.paymentId },
        });

        if (payment) {
          payment.status = PAYMENT_STATUS.SUCCESS;
          payment.customerPaidAmount =
            dto?.collectedAmount != null
              ? Number(dto.collectedAmount)
              : Number(order.totalAmount);
          payment.paidAt = new Date();
          if (dto?.remark) {
            payment.remark = dto.remark;
          }
          await paymentRepo.save(payment);
        }
      }

      order.paymentStatus = ORDER_PAYMENT_STATUS.PAID;
      const savedOrder = await orderRepo.save(order);

      return savedOrder;
    });
  }
}
