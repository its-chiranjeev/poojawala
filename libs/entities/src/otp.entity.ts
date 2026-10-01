import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { USER_ROLE } from './user.entity';

export enum OTP_TYPE {
  USER_REGISTRATION = 'USER_REGISTRATION',
  RESET_PASSWORD = 'RESET_PASSWORD',
  RESEND_OTP = 'RESEND_OTP',
}

@Entity('otps')
export class Otp {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string;

  @Index()
  @Column({ type: 'varchar', length: 15, nullable: true })
  phone?: string;

  // TODO: FAST2SMS_OTP_FIX - Previous plaintext 10-char column.
  // Kept for rollback reference.
  // @Column({ type: 'varchar', length: 10 })
  // otp!: string;
  @Column({ type: 'varchar', length: 255 })
  otp!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'enum', enum: USER_ROLE, nullable: true })
  role?: USER_ROLE;

  @Column({
    type: 'enum',
    enum: OTP_TYPE,
    nullable: true,
  })
  otpType?: OTP_TYPE;


  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'boolean', default: false })
  isVerified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}

