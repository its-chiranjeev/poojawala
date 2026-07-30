import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { Booking } from './booking.entity';
import { User } from './user.entity';
import { Payment } from './payment.entity';

export enum COMPLAINT_CATEGORY {
  SERVICE_NOT_PROVIDED = 'SERVICE_NOT_PROVIDED',
  LATE_ARRIVAL = 'LATE_ARRIVAL',
  BEHAVIOR_ISSUE = 'BEHAVIOR_ISSUE',
  PAYMENT_ISSUE = 'PAYMENT_ISSUE',
  QUALITY_ISSUE = 'QUALITY_ISSUE',
  TECHNICAL_ISSUE = 'TECHNICAL_ISSUE',
  ACCOUNT_ISSUE = 'ACCOUNT_ISSUE',
  GENERAL_QUERY = 'GENERAL_QUERY',
  OTHER = 'OTHER',
}

export enum COMPLAINT_STATUS {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED_CUSTOMER_FAVOR = 'RESOLVED_CUSTOMER_FAVOR',
  RESOLVED_PUROHIT_FAVOR = 'RESOLVED_PUROHIT_FAVOR',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  complaintNumber!: string;

  @Column({ type: 'int', nullable: true })
  bookingId?: number;

  @ManyToOne(() => Booking, (booking) => booking.complaints, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'bookingId' })
  booking?: Booking;

  @Column({ type: 'int' })
  raisedById!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raisedById' })
  raisedBy!: User;

  @Column({ type: 'int', nullable: true })
  raisedAgainstId?: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'raisedAgainstId' })
  raisedAgainst?: User;

  @Column({
    type: 'enum',
    enum: COMPLAINT_CATEGORY,
    default: COMPLAINT_CATEGORY.OTHER,
  })
  category!: COMPLAINT_CATEGORY;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject?: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  evidenceUrls?: string[];

  @Column({
    type: 'enum',
    enum: COMPLAINT_STATUS,
    default: COMPLAINT_STATUS.OPEN,
  })
  status!: COMPLAINT_STATUS;

  @Column({ type: 'text', nullable: true })
  resolutionNotes?: string;

  @Column({ type: 'int', nullable: true })
  resolvedById?: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'int', nullable: true })
  linkedPaymentId?: number;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'linkedPaymentId' })
  linkedPayment?: Payment;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}