import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { PUROHIT_VERIFICATION_STATUS } from './purohit-profile.entity';

@Entity('astrologer_profiles')
export class AstrologerProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'int', unique: true })
  userId!: number;

  @OneToOne(() => User, (user) => user.astrologerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'jsonb', nullable: true })
  qualification?: string[];

  @Column({ type: 'int', nullable: true })
  experienceYears?: number;

  @Column({ type: 'jsonb', nullable: true })
  languages?: string[];

  @Column({ type: 'jsonb', nullable: true })
  specializations?: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  specification?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  aadhaarNumber?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  aadhaarDocUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  panDocUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  certificateUrl?: string;

  @Column({
    type: 'enum',
    enum: PUROHIT_VERIFICATION_STATUS,
    default: PUROHIT_VERIFICATION_STATUS.PENDING,
  })
  verificationStatus!: PUROHIT_VERIFICATION_STATUS;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state?: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0.0 })
  avgRating!: number;

  /** Per minute consultation rate (e.g. ₹15.00/min) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ratePerMinute?: number | null;

  /** Astrology platform commission price (e.g. ₹50.00) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  commissionPrice?: number | null;

  /** Base astrology consultation price (e.g. ₹500.00) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  astrologyPrice?: number | null;

  /** Commission percentage applied to astrology consultations (e.g. 10.00%) */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  commissionPercentage?: number | null;

  /** Net astrologer payout (astrologyPrice - commissionPrice) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  astrologerPayout?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
