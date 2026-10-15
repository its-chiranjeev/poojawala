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
import { User } from './user.entity';

export enum PLATFORM_SETTING_KEY {
  PLATFORM_NAME = 'PLATFORM_NAME',
  SUPPORT_EMAIL = 'SUPPORT_EMAIL',
  SUPPORT_PHONE = 'SUPPORT_PHONE',
  COMMISSION_PERCENTAGE = 'COMMISSION_PERCENTAGE',
  GST_PERCENTAGE = 'GST_PERCENTAGE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  PRIVACY_POLICY_URL = 'PRIVACY_POLICY_URL',
  TERMS_AND_CONDITIONS_URL = 'TERMS_AND_CONDITIONS_URL',
  FACEBOOK_URL = 'FACEBOOK_URL',
  INSTAGRAM_URL = 'INSTAGRAM_URL',
  YOUTUBE_URL = 'YOUTUBE_URL',
  ASTROLOGY_COMMISSION_PRICE = 'ASTROLOGY_COMMISSION_PRICE',
}

@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({
    type: 'enum',
    enum: PLATFORM_SETTING_KEY,
    unique: true,
  })
  key!: PLATFORM_SETTING_KEY;

  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'int', nullable: true })
  updatedById?: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updatedById' })
  updatedBy?: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}