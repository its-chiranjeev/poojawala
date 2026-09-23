import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ACTOR_TYPE,
  AUDIT_MODULE,
  NOTIFICATION_TYPE,
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
import { AuditLogService } from '@poojawala/common';
import { NotificationService } from '@poojawala/notification';
import { EmailService, renderPoojawalaEmail } from '@poojawala/email-services';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly dataSource: DataSource,
    @Optional() private readonly s3Service?: S3Service,
    @Optional() private readonly auditLogService?: AuditLogService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly emailService?: EmailService,
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

    if (order.orderStatus === dto.status) {
      return this.formatOrder(order);
    }

    const previousStatus = order.orderStatus;
    order.orderStatus = dto.status;
    const savedOrder = await this.orderRepository.save(order);

    // Audit log: ORDER_STATUS_CHANGED
    if (this.auditLogService) {
      try {
        await this.auditLogService.createAuditLog({
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.PRODUCT,
          entity: 'Order',
          entityId: String(order.id),
          action: 'ORDER_STATUS_CHANGED',
          message: `Admin updated Order #${order.orderNumber} status from ${previousStatus} to ${dto.status}.`,
          oldValue: { orderStatus: previousStatus },
          newValue: { orderStatus: dto.status },
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            previousStatus,
            newStatus: dto.status,
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to create order status audit log: ${err?.message}`,
        );
      }
    }

    // Customer Notification
    if (order.customerId && this.notificationService) {
      try {
        await this.notificationService.createNotification(
          order.customerId,
          'Order Status Updated',
          `Your order #${order.orderNumber} status has been updated to ${dto.status}.`,
          NOTIFICATION_TYPE.SYSTEM,
          order.id,
          'ORDER',
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to send order status notification: ${err?.message}`,
        );
      }
    }

    // Customer Email
    if (order.customerId && this.emailService) {
      try {
        const customer =
          order.customer ||
          (await this.dataSource
            .getRepository(User)
            .findOne({ where: { id: order.customerId } }));
        if (customer?.email) {
          const customerName =
            [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
            'Devotee';
          const html = renderPoojawalaEmail({
            statusBadge: `Order ${dto.status}`,
            userName: customerName,
            preheaderText: `Order #${order.orderNumber} is now ${dto.status}`,
            emailMessage: `Your order <strong>#${order.orderNumber}</strong> has been updated to <strong>${dto.status}</strong>.`,
            detailsTable: {
              title: 'Order Status Update',
              rows: [
                { label: 'Order Number', value: `#${order.orderNumber}` },
                { label: 'New Status', value: dto.status, isHighlight: true },
                { label: 'Previous Status', value: previousStatus },
                { label: 'Total Amount', value: `₹${order.totalAmount}` },
              ],
            },
          });

          await this.emailService.sendMail({
            to: customer.email,
            subject: `Order #${order.orderNumber} Status: ${dto.status} - Poojawala`,
            html,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Failed to send order status email: ${err?.message}`);
      }
    }

    return this.formatOrder(savedOrder);
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

    const collectedAmount =
      dto?.collectedAmount != null
        ? Number(dto.collectedAmount)
        : Number(order.totalAmount);

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const paymentRepo = manager.getRepository(Payment);

      if (order.paymentId) {
        const payment = await paymentRepo.findOne({
          where: { id: order.paymentId },
        });

        if (payment) {
          payment.status = PAYMENT_STATUS.SUCCESS;
          payment.customerPaidAmount = collectedAmount;
          payment.paidAt = new Date();
          if (dto?.remark) {
            payment.remark = dto.remark;
          }
          await paymentRepo.save(payment);
        }
      }

      order.paymentStatus = ORDER_PAYMENT_STATUS.PAID;
      return orderRepo.save(order);
    });

    // Audit log: COD_PAYMENT_COLLECTED
    if (this.auditLogService) {
      try {
        await this.auditLogService.createAuditLog({
          actorId: user.id,
          actorType: ACTOR_TYPE.USER,
          actorRole: user.role,
          module: AUDIT_MODULE.PAYMENT,
          entity: 'Order',
          entityId: String(savedOrder.id),
          action: 'COD_PAYMENT_COLLECTED',
          message: `COD payment of ₹${collectedAmount} collected for Order #${savedOrder.orderNumber}.`,
          oldValue: { paymentStatus: ORDER_PAYMENT_STATUS.PENDING },
          newValue: {
            paymentStatus: ORDER_PAYMENT_STATUS.PAID,
            customerPaidAmount: collectedAmount,
          },
          metadata: {
            orderId: savedOrder.id,
            orderNumber: savedOrder.orderNumber,
            collectedAmount,
            remark: dto?.remark,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to create COD audit log: ${err?.message}`);
      }
    }

    // Customer Notification
    if (savedOrder.customerId && this.notificationService) {
      try {
        await this.notificationService.createNotification(
          savedOrder.customerId,
          'COD Payment Collected',
          `Your Cash on Delivery payment of ₹${collectedAmount} for Order #${savedOrder.orderNumber} has been received.`,
          NOTIFICATION_TYPE.PAYMENT,
          savedOrder.id,
          'ORDER',
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to send COD collection notification: ${err?.message}`,
        );
      }
    }

    // Customer Email
    if (savedOrder.customerId && this.emailService) {
      try {
        const customer =
          order.customer ||
          (await this.dataSource
            .getRepository(User)
            .findOne({ where: { id: savedOrder.customerId } }));
        if (customer?.email) {
          const customerName =
            [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
            'Devotee';
          const html = renderPoojawalaEmail({
            statusBadge: 'Payment Received',
            userName: customerName,
            preheaderText: `Payment received for Order #${savedOrder.orderNumber}`,
            emailMessage: `We have received your Cash on Delivery payment of <strong>₹${collectedAmount}</strong> for Order <strong>#${savedOrder.orderNumber}</strong>. Thank you for choosing Poojawala!`,
            detailsTable: {
              title: 'Payment Details',
              rows: [
                { label: 'Order Number', value: `#${savedOrder.orderNumber}` },
                { label: 'Payment Method', value: 'Cash on Delivery (COD)' },
                {
                  label: 'Amount Collected',
                  value: `₹${collectedAmount}`,
                  isHighlight: true,
                },
                { label: 'Payment Status', value: 'PAID' },
              ],
            },
          });

          await this.emailService.sendMail({
            to: customer.email,
            subject: `COD Payment Received - Poojawala | Order #${savedOrder.orderNumber}`,
            html,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Failed to send COD collection email: ${err?.message}`);
      }
    }

    return this.formatOrder(savedOrder);
  }
}
