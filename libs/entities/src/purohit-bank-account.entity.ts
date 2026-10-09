import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { PurohitProfile } from './purohit-profile.entity';

export enum PUROHIT_PAYMENT_METHOD {
  BANK = 'BANK',
  UPI = 'UPI',
}

export enum BANK_VERIFICATION_STATUS {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

export enum BANK_ACCOUNT_TYPE {
  SAVINGS = 'SAVINGS',
  CURRENT = 'CURRENT',
}

@Index('UQ_purohit_bank_accounts_single_primary', ['purohitId'], {
  unique: true,
  where: '"isPrimary" = true AND "deletedAt" IS NULL',
})
@Entity('purohit_bank_accounts')
export class PurohitBankAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (profile) => profile.bankAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohitId' })
  purohit!: PurohitProfile;

  @Column({ type: 'varchar', length: 100, nullable: true })
  accountHolderName?: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  accountNumber?: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  ifscCode?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName?: string;

  @Column({
    type: 'enum',
    enum: BANK_ACCOUNT_TYPE,
    nullable: true,
  })
  accountType?: BANK_ACCOUNT_TYPE;

  @Column({ type: 'varchar', length: 100, nullable: true })
  upiId?: string;

  @Column({
    type: 'enum',
    enum: PUROHIT_PAYMENT_METHOD,
    default: PUROHIT_PAYMENT_METHOD.BANK,
  })
  paymentMethod!: PUROHIT_PAYMENT_METHOD;

  @Column({ type: 'boolean', default: false })
  isPrimary!: boolean;

  @Column({
    type: 'enum',
    enum: BANK_VERIFICATION_STATUS,
    default: BANK_VERIFICATION_STATUS.PENDING,
  })
  verificationStatus!: BANK_VERIFICATION_STATUS;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}