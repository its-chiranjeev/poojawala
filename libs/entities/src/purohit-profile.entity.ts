import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { PurohitBankAccount } from './purohit-bank-account.entity';
import { PurohitServiceArea } from './purohit-service-area.entity';
import { PurohitMedia } from './purohit-media.entity';
import { PurohitService } from './purohit-service.entity';
import { CustomerFavorite } from './customer-favorite.entity';
import { Booking } from './booking.entity';
import { Review } from './review.entity';

export enum QUALIFICATION {
  SHASTRI = 'SHASTRI',
  ACHARYA = 'ACHARYA',
  VEDPATHI = 'VEDPATHI',
  OTHER = 'OTHER',
}

export enum PUROHIT_VERIFICATION_STATUS {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('purohit_profiles')
export class PurohitProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'int', unique: true })
  userId!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({
    type: 'enum',
    enum: QUALIFICATION,
    nullable: true,
  })
  qualification?: QUALIFICATION;

  @Column({ type: 'int', nullable: true })
  experienceYears?: number;

  @Column({ type: 'jsonb', nullable: true })
  languages?: string[];

  @Column({ type: 'jsonb', nullable: true })
  specializations?: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  aadhaarNumber?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  aadhaarDocUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  panDocUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  certificateUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  templeAffiliationProofUrl?: string;

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

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0.0 })
  avgRating!: number;

  @Column({ type: 'int', default: 0 })
  totalReviews!: number;

  @Column({ type: 'boolean', default: false })
  isOnlineAvailable!: boolean;

  @Column({ type: 'boolean', default: false })
  isOfflineAvailable!: boolean;

  @OneToMany(() => PurohitBankAccount, (account) => account.purohit)
  bankAccounts!: PurohitBankAccount[];

  @OneToMany(() => PurohitServiceArea, (area) => area.purohit)
  serviceAreas!: PurohitServiceArea[];

  @OneToMany(() => PurohitMedia, (media) => media.purohit)
  media!: PurohitMedia[];

  @OneToMany(() => PurohitService, (purohitService) => purohitService.purohit)
  purohitServices!: PurohitService[];

  @OneToMany(() => CustomerFavorite, (favorite) => favorite.purohit)
  favoritedBy!: CustomerFavorite[];

  @OneToMany(() => Booking, (booking) => booking.purohit)
  bookings!: Booking[];

  @OneToMany(() => Review, (review) => review.purohit)
  reviews!: Review[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
