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
import { Booking } from './booking.entity';
import { User } from './user.entity';
import { Payment } from './payment.entity';
import { Product } from './product.entity';

@Entity('booking_products')
export class BookingProduct {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  bookingId?: number | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'bookingId' })
  booking?: Booking | null;

  @Index()
  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer!: User;

  @Index()
  @Column({ type: 'int', nullable: true })
  paymentId?: number | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paymentId' })
  payment?: Payment | null;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'varchar', length: 255 })
  productNameSnapshot!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPriceSnapshot!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
