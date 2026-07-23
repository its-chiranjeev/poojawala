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
} from 'typeorm';
import { User } from './user.entity';
import { Service } from './service.entity';
import { PurohitProfile } from './purohit-profile.entity';
import { CustomerAddress } from './customer-address.entity';
import { Payment } from './payment.entity';
import { Review } from './review.entity';
import { Complaint } from './complaint.entity';

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
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum ASSIGNMENT_TYPE {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export enum CANCELLED_BY {
  CUSTOMER = 'CUSTOMER',
  PUROHIT = 'PUROHIT',
  ADMIN = 'ADMIN',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  bookingNumber!: string;

  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, (user) => user.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: User;

  @Column({ type: 'int' })
  serviceId!: number;

  @ManyToOne(() => Service, (service) => service.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service!: Service;

  @Column({ type: 'int', nullable: true })
  purohitId?: number;

  @ManyToOne(() => PurohitProfile, (purohit) => purohit.bookings, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'purohit_id' })
  purohit?: PurohitProfile;

  @Column({ type: 'int', nullable: true })
  customerAddressId?: number;

  @ManyToOne(() => CustomerAddress, (address) => address.bookings, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'customer_address_id' })
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

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  agreedPrice!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  commissionPercentage!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  platformCommission!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  purohitPayoutAmount!: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  couponCode?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  discountAmount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  donationAmount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  finalAmount!: number;

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

  @OneToOne(() => Review, (review) => review.booking)
  review?: Review;

  @OneToMany(() => Complaint, (complaint) => complaint.booking)
  complaints!: Complaint[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
