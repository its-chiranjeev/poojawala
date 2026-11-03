import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Order, ORDER_PAYMENT_STATUS, ORDER_STATUS } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetOrdersQueryDto } from '@poojawala/dtos';

@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  constructor(
    @InjectRepository(Order)
    repo: Repository<Order>,
  ) {
    super(repo);
  }

  private applyFilters(
    qb: SelectQueryBuilder<Order>,
    query: GetOrdersQueryDto,
  ): void {
    // Do not show PENDING_PAYMENT orders in get all orders API to admin or customer
    qb.andWhere('order.orderStatus != :excludedPendingPaymentStatus', {
      excludedPendingPaymentStatus: ORDER_STATUS.PENDING_PAYMENT,
    });

    if (query.orderStatus) {
      qb.andWhere('order.orderStatus = :orderStatus', {
        orderStatus: query.orderStatus,
      });
    }

    if (query.paymentStatus) {
      qb.andWhere('order.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }

    if (query.paymentMethod) {
      qb.andWhere('order.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(CAST("order"."id" AS TEXT) ILIKE :term OR "order"."orderNumber" ILIKE :term OR "order"."shippingAddressSnapshot"->>\'name\' ILIKE :term OR "order"."shippingAddressSnapshot"->>\'phone\' ILIKE :term)',
        { term },
      );
    }
  }

  async findCustomerOrders(
    customerId: number,
    query: GetOrdersQueryDto,
  ): Promise<{ orders: Order[]; total: number }> {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.max(Number(query.limit || 10), 1);
    const skip = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .where('order.customerId = :customerId', { customerId });

    this.applyFilters(qb, query);

    qb.orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
  }

  async findCustomerOrderById(
    customerId: number,
    orderId: number,
  ): Promise<Order | null> {
    return this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('order.payment', 'payment')
      .where('order.id = :orderId AND order.customerId = :customerId', {
        orderId,
        customerId,
      })
      .getOne();
  }

  async findAllOrdersAdmin(
    query: GetOrdersQueryDto,
  ): Promise<{ orders: Order[]; total: number }> {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.max(Number(query.limit || 10), 1);
    const skip = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.customer', 'customer');

    if (query.customerId) {
      qb.andWhere('order.customerId = :customerId', {
        customerId: query.customerId,
      });
    }

    this.applyFilters(qb, query);

    qb.orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
  }

  async findOrderByIdWithDetails(orderId: number): Promise<Order | null> {
    return this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.customer', 'customer')
      .where('order.id = :orderId', { orderId })
      .getOne();
  }

  async findByPaymentId(paymentId: number): Promise<Order | null> {
    return this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .where('order.paymentId = :paymentId', { paymentId })
      .getOne();
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    return this.repo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .where('order.orderNumber = :orderNumber', { orderNumber })
      .getOne();
  }

  async getAdminDashboardOrderStats(): Promise<{
    totalOrderCount: number;
    totalOrderRevenue: number;
  }> {
    const query = this.repo
      .createQueryBuilder('ord')
      .select(
        `COUNT(CASE WHEN ord."orderStatus" != :pendingPayment THEN 1 END)`,
        'totalOrderCount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord."paymentStatus" = :paid THEN ord."totalAmount" ELSE 0 END), 0)`,
        'totalOrderRevenue',
      );

    const result = await query
      .setParameters({
        pendingPayment: ORDER_STATUS.PENDING_PAYMENT,
        paid: ORDER_PAYMENT_STATUS.PAID,
      })
      .getRawOne();

    return {
      totalOrderCount: Number(result?.totalOrderCount) || 0,
      totalOrderRevenue: Number(Number(result?.totalOrderRevenue || 0).toFixed(2)),
    };
  }

  async getCustomerDashboardOrderStats(customerId: number): Promise<{
    totalOrders: number;
    pendingOrders: number;
    deliveredOrders: number;
  }> {
    const pendingStatuses = [
      ORDER_STATUS.PENDING_PAYMENT,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PROCESSING,
      ORDER_STATUS.SHIPPED,
      ORDER_STATUS.OUT_FOR_DELIVERY,
    ];

    const query = this.repo
      .createQueryBuilder('ord')
      .select('COUNT(*)', 'totalOrders')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord."orderStatus" IN (:...pendingStatuses) THEN 1 ELSE 0 END), 0)`,
        'pendingOrders',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord."orderStatus" = :delivered THEN 1 ELSE 0 END), 0)`,
        'deliveredOrders',
      )
      .where('ord.customerId = :customerId', { customerId });

    const result = await query
      .setParameters({
        pendingStatuses,
        delivered: ORDER_STATUS.DELIVERED,
      })
      .getRawOne();

    return {
      totalOrders: Number(result?.totalOrders) || 0,
      pendingOrders: Number(result?.pendingOrders) || 0,
      deliveredOrders: Number(result?.deliveredOrders) || 0,
    };
  }
}
