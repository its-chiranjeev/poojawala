import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { PurohitService } from './purohit-service.entity';
import { Booking } from './booking.entity';

export interface ServiceCity {
  name: string;
  state?: string;
}

export interface ServiceLanguage {
  name: string;
  code?: string;
}

export interface ServiceBenefit {
  title: string;
  description?: string;
}

export type JsonPrimitive = string | number | boolean | null;
export type ServicePlanFeatureValue =
  | JsonPrimitive
  | Record<string, JsonPrimitive>
  | JsonPrimitive[];

export interface ServicePlanDetails {
  price: number;
  tokenAmount?: number;
  [featureKey: string]: ServicePlanFeatureValue | undefined;
}

export interface ServicePlans {
  BASIC?: ServicePlanDetails;
  STANDARD?: ServicePlanDetails;
  [key: string]: ServicePlanDetails | undefined;
}

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

  @Column({
    type: 'jsonb',
    nullable: false,
    default: () => "'[]'",
  })
  cities!: ServiceCity[];

  @Column({
    type: 'jsonb',
    nullable: false,
    default: () => "'[]'",
  })
  languages!: ServiceLanguage[];

  @Column({
    type: 'jsonb',
    nullable: false,
    default: () => "'[]'",
  })
  benefits!: ServiceBenefit[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  iconUrl?: string;

  // TODO: Legacy pricing fields.
  // Retained for backward compatibility.
  // New pricing logic must use priceWithoutSamagri / priceWithSamagri.
  // Remove only after legacy data and consumers have been fully migrated.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minPrice!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxPrice!: number;

  // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
  // @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  // priceWithoutSamagri?: number | null;

  // // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
  // @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  // priceWithSamagri?: number | null;

  /**
   * Configurable service plans: exactly 'basic' and 'standard'.
   * Admin can configure independent key-value feature objects for each.
   */
  @Column({ type: 'jsonb', nullable: true })
  plans?: ServicePlans | null;

  // Service-level token configuration for booking payments (defaults to 30%).
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  tokenPercentage!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  commissionPercentage!: number; // e.g. 15.00 means 15% — admin sets per service category

  @Column({ type: 'int', default: 60 })
  durationMinutes!: number;

  @Column({ type: 'boolean', default: false })
  requiresVenue!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  isUpcomingFestival!: boolean;

  @Column({ type: 'timestamp', nullable: true, default: null })
  festivalStartDate?: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  festivalEndDate?: Date | null;

  @OneToMany(() => PurohitService, (purohitService) => purohitService.service)
  purohitServices!: PurohitService[];

  @OneToMany(() => Booking, (booking) => booking.service)
  bookings!: Booking[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
