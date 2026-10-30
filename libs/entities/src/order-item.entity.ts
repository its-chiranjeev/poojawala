import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from './product.entity';

export interface OrderItemSnapshot {
  productName: string;
  productImage?: string | null;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  cartItemUpdatedAt?: string | null;
}

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'int' })
  orderId!: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Index()
  @Column({ type: 'int', nullable: true })
  cartItemId?: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  productId?: number | null;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  @Column({ type: 'jsonb' })
  snapshot!: OrderItemSnapshot;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
