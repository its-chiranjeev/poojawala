import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  DeleteDateColumn,
} from 'typeorm';
import { PurohitProfile } from './purohit-profile.entity';
import { Service } from './service.entity';


@Entity('purohit_services')
@Unique(['purohitId', 'serviceId'])
export class PurohitService {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (profile) => profile.purohitServices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohitId' })
  purohit!: PurohitProfile;

  @Column({ type: 'int' })
  serviceId!: number;

  @ManyToOne(() => Service, (service) => service.purohitServices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'serviceId' })
  service!: Service;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customPrice!: number;

  @Column({ type: 'int', nullable: true })
  durationMinutes?: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}

