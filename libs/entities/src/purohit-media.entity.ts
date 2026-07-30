import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import { PurohitProfile } from './purohit-profile.entity';

export enum PUROHIT_MEDIA_TYPE {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export enum PUROHIT_MEDIA_VERIFICATION_STATUS {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('purohit_media')
export class PurohitMedia {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (profile) => profile.media, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohitId' })
  purohit!: PurohitProfile;

  @Column({
    type: 'enum',
    enum: PUROHIT_MEDIA_TYPE,
  })
  mediaType!: PUROHIT_MEDIA_TYPE;

@Column({
  type: 'varchar',
  length: 100,
  nullable: true,
})
documentType?: string;

 @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({
  type: 'enum',
  enum: PUROHIT_MEDIA_VERIFICATION_STATUS,
  default: PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING,
})
verificationStatus!: PUROHIT_MEDIA_VERIFICATION_STATUS;

  @Column({ type: 'varchar', length: 255 })
  mediaUrl!: string;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}