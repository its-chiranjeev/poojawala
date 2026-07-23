import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { CouponUsage } from './coupon-usage.entity';

export enum DISCOUNT_TYPE {
  FLAT = 'FLAT',
  PERCENTAGE = 'PERCENTAGE',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: DISCOUNT_TYPE,
    default: DISCOUNT_TYPE.FLAT,
  })
  discountType!: DISCOUNT_TYPE;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountValue!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxDiscountAmount?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minBookingAmount?: number;

  @Column({ type: 'jsonb', nullable: true })
  applicableServiceIds?: number[];

  @Column({ type: 'int', nullable: true })
  usageLimitTotal?: number;

  @Column({ type: 'int', default: 1 })
  usageLimitPerCustomer!: number;

  @Column({ type: 'timestamp' })
  validFrom!: Date;

  @Column({ type: 'timestamp' })
  validUntil!: Date;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int' })
  createdById!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @OneToMany(() => CouponUsage, (usage) => usage.coupon)
  usages!: CouponUsage[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
