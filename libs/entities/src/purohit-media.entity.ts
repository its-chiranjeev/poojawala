import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurohitProfile } from './purohit-profile.entity';

export enum PUROHIT_MEDIA_TYPE {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
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

  @Column({ type: 'varchar', length: 255 })
  mediaUrl!: string;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;
}