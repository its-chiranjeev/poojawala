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
  PLATFORM_NAME = 'platform_name',
  SUPPORT_EMAIL = 'support_email',
  SUPPORT_PHONE = 'support_phone',
  COMMISSION_PERCENTAGE = 'commission_percentage',
  GST_PERCENTAGE = 'gst_percentage',
  MAINTENANCE_MODE = 'maintenance_mode',
  PRIVACY_POLICY_URL = 'privacy_policy_url',
  TERMS_AND_CONDITIONS_URL = 'terms_and_conditions_url',
  FACEBOOK_URL = 'facebook_url',
  INSTAGRAM_URL = 'instagram_url',
  YOUTUBE_URL = 'youtube_url',
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