import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { PurohitService } from './purohit-service.entity';
import { Booking } from './booking.entity';

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  iconUrl?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  minPrice!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  maxPrice!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  commissionPercentage!: number; // e.g. 15.00 means 15% — admin sets per service category

  @Column({ type: 'int', default: 60 })
  durationMinutes!: number;

  @Column({ type: 'boolean', default: false })
  requiresVenue!: boolean;

  @Column({ type: 'boolean', default: true })
  supportsOnline!: boolean;

  @Column({ type: 'boolean', default: true })
  supportsOffline!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => PurohitService, (purohitService) => purohitService.service)
  purohitServices!: PurohitService[];

  @OneToMany(() => Booking, (booking) => booking.service)
  bookings!: Booking[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}