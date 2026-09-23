import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Booking } from './booking.entity';
import { User } from './user.entity';
import { PaymentBooking } from './payment-booking.entity';
import { PurohitBankAccount } from './purohit-bank-account.entity';

export enum PAYMENT_TYPE {
  BOOKING_PAYMENT = 'BOOKING_PAYMENT',
  PUROHIT_PAYOUT = 'PUROHIT_PAYOUT',
  CUSTOMER_REFUND = 'CUSTOMER_REFUND',
  DONATION = 'DONATION',
  PRODUCT_PAYMENT = 'PRODUCT_PAYMENT',
}

export enum CUSTOMER_PAYMENT_METHOD {
  CASH = 'CASH',
  ONLINE = 'ONLINE',
}

export enum PAYMENT_METHOD {
  UPI = 'UPI',
  CARD = 'CARD',
  NETBANKING = 'NETBANKING',
  WALLET = 'WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum PAYMENT_STATUS {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'enum',
    enum: PAYMENT_TYPE,
    default: PAYMENT_TYPE.BOOKING_PAYMENT,
  })
  paymentType!: PAYMENT_TYPE;

  @Column({ type: 'int', nullable: true })
  bookingId?: number;

  @ManyToOne(() => Booking, (booking) => booking.payments, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'bookingId' })
  booking?: Booking;

  @Column({ type: 'int' })
  createdById!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy!: User;

  @Column({ type: 'int', nullable: true })
  payerId?: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payerId' })
  payer?: User;

  @Column({ type: 'int', nullable: true })
  payeeId?: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payeeId' })
  payee?: User;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  customerPaidAmount?: number;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: CUSTOMER_PAYMENT_METHOD,
    nullable: true,
  })
  customerPaymentMethod?: CUSTOMER_PAYMENT_METHOD;

  @Column({
    type: 'enum',
    enum: PAYMENT_METHOD,
    nullable: true,
  })
  paymentMethod?: PAYMENT_METHOD;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpayOrderId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpayPaymentLinkId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpayPaymentId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpayRefundId?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  razorpayFee?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  razorpayTax?: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankTransferReference?: string;

  @Column({
    type: 'enum',
    enum: PAYMENT_STATUS,
    default: PAYMENT_STATUS.CREATED,
  })
  status!: PAYMENT_STATUS;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  idempotencyKey?: string;

  @Column({ type: 'int', nullable: true })
  purohitBankAccountId?: number;

  @ManyToOne(() => PurohitBankAccount, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'purohitBankAccountId' })
  purohitBankAccount?: PurohitBankAccount;

  @Column({ type: 'text', nullable: true })
  remark?: string;

  @OneToMany(() => PaymentBooking, (paymentBooking) => paymentBooking.payment)
  paymentBookings!: PaymentBooking[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
    deletedAt?: Date;
}