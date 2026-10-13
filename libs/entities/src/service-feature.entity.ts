import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Service } from './service.entity';

export enum SERVICE_FEATURE_TYPE {
  PRICE = 'PRICE',
  NORMAL = 'NORMAL',
}

export enum SERVICE_FEATURE_PLAN {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD'
}

@Entity('service_features')
export class ServiceFeature {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'int' })
  serviceId!: number;

  @ManyToOne(() => Service, (service) => service.serviceFeatures, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'serviceId' })
  service!: Service;

  @Index()
  @Column({
    type: 'enum',
    enum: SERVICE_FEATURE_PLAN,
    default: SERVICE_FEATURE_PLAN.BASIC,
  })
  plan!: SERVICE_FEATURE_PLAN;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'enum',
    enum: SERVICE_FEATURE_TYPE,
    default: SERVICE_FEATURE_TYPE.NORMAL,
  })
  type!: SERVICE_FEATURE_TYPE;

  @Column({ type: 'varchar', length: 255, default: 'true' })
  value!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;
}
