import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Payment } from './payment.entity';
import { OrderItem } from './order-item.entity';

export enum ORDER_STATUS {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  RETURN_REQUESTED = 'RETURN_REQUESTED',
  RETURNED = 'RETURNED',
}

export enum ORDER_PAYMENT_METHOD {
  ONLINE = 'ONLINE',
  COD = 'COD',
}

export enum ORDER_PAYMENT_STATUS {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  COD_PENDING = 'COD_PENDING',
  REFUNDED = 'REFUNDED',
}

export interface ShippingAddressSnapshot {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  pincode: string;
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  orderNumber!: string;

  @Index()
  @Column({ type: 'int', nullable: true })
  customerId?: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: User | null;

  @Column({ type: 'int', nullable: true })
  paymentId?: number | null;

  @OneToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paymentId' })
  payment?: Payment | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountAmount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({
    type: 'enum',
    enum: ORDER_PAYMENT_METHOD,
    default: ORDER_PAYMENT_METHOD.ONLINE,
  })
  paymentMethod!: ORDER_PAYMENT_METHOD;

  @Index()
  @Column({
    type: 'enum',
    enum: ORDER_PAYMENT_STATUS,
    default: ORDER_PAYMENT_STATUS.PENDING,
  })
  paymentStatus!: ORDER_PAYMENT_STATUS;

  @Index()
  @Column({
    type: 'enum',
    enum: ORDER_STATUS,
    default: ORDER_STATUS.PENDING_PAYMENT,
  })
  orderStatus!: ORDER_STATUS;

  @Column({ type: 'jsonb' })
  shippingAddressSnapshot!: ShippingAddressSnapshot;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];

  @Index()
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Index()
  @Column({ type: 'timestamp', nullable: true })
  expiredAt?: Date | null;

  @DeleteDateColumn()
  deletedAt?: Date;
}
