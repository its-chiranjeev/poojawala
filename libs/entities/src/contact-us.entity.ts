import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Service } from './service.entity';

export enum CONTACT_US_STATUS {
  DRAFT = 'DRAFT',
  READ = 'READ',
}

@Entity('contact_us')
export class ContactUs {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  serviceId?: number | null;

  @ManyToOne(() => Service, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'serviceId' })
  service?: Service | null;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 150 })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'timestamptz', nullable: true })
  preferredDateTime?: Date | string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({
    type: 'enum',
    enum: CONTACT_US_STATUS,
    default: CONTACT_US_STATUS.DRAFT,
  })
  status!: CONTACT_US_STATUS;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
