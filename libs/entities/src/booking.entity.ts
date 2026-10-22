import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Service } from './service.entity';
import { PurohitProfile } from './purohit-profile.entity';
import { CustomerAddress } from './customer-address.entity';
import { Payment } from './payment.entity';
import { Complaint } from './complaint.entity';
import { AstrologerProfile } from './astrologer-profile.entity';

export enum SERVICE_PLAN {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
}

export enum BOOKING_STATUS {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  ENROUTE = 'ENROUTE',
  ARRIVED = 'ARRIVED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum BOOKING_PAYMENT_STATUS {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  FAILED = 'FAILED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  // TODO: Deprecated.
  // Payment is required for every booking, including Admin-created bookings.
  // Admin-created bookings only defer when the payment is collected.
  // NOT_REQUIRED should no longer be used as a payment status.
  // NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum BOOKING_PAYMENT_TYPE {
  TOKEN = 'TOKEN',
  FULL = 'FULL',
  DEFERRED = 'DEFERRED',
}

export enum ASSIGNMENT_TYPE {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export enum CANCELLED_BY {
  CUSTOMER = 'CUSTOMER',
  PUROHIT = 'PUROHIT',
  ADMIN = 'ADMIN',
  ASTROLOGER = 'ASTROLOGER',
}

export enum BOOKING_MODE {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export enum REVIEW_STATUS {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export enum BOOKING_TYPE {
  POOJA = 'POOJA',
  ASTROLOGY = 'ASTROLOGY',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  bookingNumber!: string;

  @Column({
    type: 'enum',
    enum: BOOKING_TYPE,
    default: BOOKING_TYPE.POOJA,
  })
  bookingType!: BOOKING_TYPE;

  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, (user) => user.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer!: User;

  @Column({ type: 'enum', enum: BOOKING_MODE, default: BOOKING_MODE.OFFLINE })
  bookingMode!: BOOKING_MODE;

  @Column({ type: 'int', nullable: true })
  serviceId?: number;

  @ManyToOne(() => Service, (service) => service.bookings, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'serviceId' })
  service?: Service;

  @Column({ type: 'int', nullable: true })
  purohitId?: number;

  @ManyToOne(() => PurohitProfile, (purohit) => purohit.bookings, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'purohitId' })
  purohit?: PurohitProfile;

  @Column({ type: 'int', nullable: true })
  astrologerId?: number;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'astrologerId' })
  astrologer?: User;

  astrologerProfile?: AstrologerProfile;

  @Column({ type: 'int', nullable: true })
  customerAddressId?: number;

  @ManyToOne(() => CustomerAddress, (address) => address.bookings, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'customerAddressId' })
  customerAddress?: CustomerAddress;

  @Column({ type: 'jsonb', nullable: true })
  addressSnapshot?: Record<string, any>;

  @Column({ type: 'varchar', length: 10, nullable: true })
  customerPincode?: string;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'text', nullable: true })
  specialInstructions?: string;

  @Column({ type: 'jsonb', nullable: true })
  customFields?: Record<string, any>;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.0, nullable: true })
  commissionPercentage?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  platformCommission?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  partnerPayoutAmount?: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  couponCode?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  discountAmount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  donationAmount!: number;

  // Selected service plan: BASIC | STANDARD
  @Column({ type: 'varchar', length: 20, nullable: true })
  plan?: SERVICE_PLAN | string | null;

  // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
  // @Column({ type: 'boolean', default: false })
  // samagriIncluded!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  servicePrice?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalAmount?: number;

  @Column({ type: 'jsonb', nullable: true })
  priceBreakDown?: Record<string, any> | null;

  // Snapshot of effective token percentage at booking creation (e.g. 30)
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  tokenPercentage?: number | null;

  // Snapshot of minimum token amount required to financially confirm booking
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  tokenAmount?: number | null;

  // Cumulative amount successfully paid by customer
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  paidAmount!: number;

  // Remaining balance to fully settle booking (finalAmount - paidAmount)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  remainingAmount?: number | null;

  @Column({
    type: 'enum',
    enum: BOOKING_STATUS,
    default: BOOKING_STATUS.PENDING,
  })
  status!: BOOKING_STATUS;

  @Column({
    type: 'enum',
    enum: BOOKING_PAYMENT_STATUS,
    default: BOOKING_PAYMENT_STATUS.PENDING,
  })
  paymentStatus!: BOOKING_PAYMENT_STATUS;

  @Column({
    type: 'enum',
    enum: BOOKING_PAYMENT_TYPE,
    default: BOOKING_PAYMENT_TYPE.TOKEN,
  })
  paymentType!: BOOKING_PAYMENT_TYPE;

  @Column({ type: 'int', nullable: true })
  bookingPaymentId?: number;

  @Column({
    type: 'enum',
    enum: BOOKING_PAYMENT_STATUS,
    default: BOOKING_PAYMENT_STATUS.PENDING,
  })
  partnerPayoutStatus!: BOOKING_PAYMENT_STATUS;

  @Column({ type: 'int', nullable: true })
  partnerPayoutId?: number;

  @Column({
    type: 'enum',
    enum: ASSIGNMENT_TYPE,
    default: ASSIGNMENT_TYPE.AUTO,
  })
  assignmentType!: ASSIGNMENT_TYPE;

  @Column({ type: 'jsonb', nullable: true })
  filteredPurohitIds?: number[];

  @Column({ type: 'jsonb', nullable: true })
  completionPhotoUrls?: string[];

  @Column({ type: 'varchar', length: 6, nullable: true })
  completionOtp?: string;

  @Column({ type: 'timestamp', nullable: true })
  completionConfirmedAt?: Date;

  @Column({
    type: 'enum',
    enum: CANCELLED_BY,
    nullable: true,
  })
  cancelledBy?: CANCELLED_BY;

  @Column({ type: 'text', nullable: true })
  cancellationReason?: string;

  @OneToMany(() => Payment, (payment) => payment.booking)
  payments!: Payment[];

  @Column({ type: 'text', nullable: true })
  customerReview?: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  customerRating?: number;

  @Column({ type: 'text', nullable: true })
  purohitReview?: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  purohitRating?: number;

  @Column({
    type: 'enum',
    enum: REVIEW_STATUS,
    default: REVIEW_STATUS.DRAFT,
  })
  reviewStatus!: REVIEW_STATUS;

  @OneToMany(() => Complaint, (complaint) => complaint.booking)
  complaints!: Complaint[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
