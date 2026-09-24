import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Order } from '@poojawala/entities';
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
        '(order.orderNumber ILIKE :term OR order.shippingAddressSnapshot->>\'name\' ILIKE :term OR order.shippingAddressSnapshot->>\'phone\' ILIKE :term)',
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
}
