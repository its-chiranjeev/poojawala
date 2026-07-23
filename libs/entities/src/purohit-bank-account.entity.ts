import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurohitProfile } from './purohit-profile.entity';

export enum BANK_ACCOUNT_TYPE {
  SAVINGS = 'SAVINGS',
  CURRENT = 'CURRENT',
}

export enum BANK_VERIFICATION_STATUS {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

@Entity('purohit_bank_accounts')
export class PurohitBankAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (profile) => profile.bankAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohit_id' })
  purohit!: PurohitProfile;

  @Column({ type: 'varchar', length: 100 })
  accountHolderName!: string;

  @Column({ type: 'varchar', length: 30 })
  accountNumber!: string;

  @Column({ type: 'varchar', length: 15 })
  ifscCode!: string;

  @Column({ type: 'varchar', length: 100 })
  bankName!: string;

  @Column({
    type: 'enum',
    enum: BANK_ACCOUNT_TYPE,
    default: BANK_ACCOUNT_TYPE.SAVINGS,
  })
  accountType!: BANK_ACCOUNT_TYPE;

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
}
