import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  DeleteDateColumn,
} from 'typeorm';
import { Payment } from './payment.entity';
import { Booking } from './booking.entity';

@Entity('payment_bookings')
@Unique(['paymentId', 'bookingId'])
export class PaymentBooking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  paymentId!: number;

  @ManyToOne(() => Payment, (payment) => payment.paymentBookings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'paymentId' })
  payment!: Payment;

  @Column({ type: 'int' })
  bookingId!: number;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bookingId' })
  booking!: Booking;

    @DeleteDateColumn()
  deletedAt?: Date;
}