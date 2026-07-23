import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Coupon } from './coupon.entity';
import { User } from './user.entity';
import { Booking } from './booking.entity';

@Entity('coupon_usages')
export class CouponUsage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  couponId!: number;

  @ManyToOne(() => Coupon, (coupon) => coupon.usages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon!: Coupon;

  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: User;

  @Column({ type: 'int' })
  bookingId!: number;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountApplied!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
