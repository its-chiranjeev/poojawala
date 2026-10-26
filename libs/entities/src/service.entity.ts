import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import { PurohitService } from './purohit-service.entity';
import { Booking } from './booking.entity';
import { Category } from './service-category.entity';
import { Temple } from './temple.entity';
import { ServiceFeature } from './service-feature.entity';

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
  basicPurohitPayoutAmount?: number;
  standardPurohitPayoutAmount?: number;
  // Features can be array of feature objects or legacy record
  features?: any;
  [featureKey: string]: any;
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
  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  slug?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  metaTitle?: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription?: string | null;

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

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () => "'[]'",
  })
  purohitCarryItems?: any;

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

  /**
   * isGlobal = true  → service is available in all cities (no city restriction).
   * isGlobal = false → service is city-specific; see the `cities` array.
   * Automatically set to true when cities array is empty, false when cities are present.
   */
  @Column({ type: 'boolean', default: true })
  isGlobal!: boolean;

  /**
   * Availability modes:
   * isOnline = true  → Service is offered online.
   * isOffline = true → Service is offered offline (in-person).
   * Both true: available online and offline.
   * Both false: rejected at API level.
   */
  @Column({ type: 'boolean', default: false })
  isOnline!: boolean;

  @Column({ type: 'boolean', default: true })
  isOffline!: boolean;

  @Column({ type: 'boolean', default: false })
  isUpcomingFestival!: boolean;

  @Column({ type: 'timestamp', nullable: true, default: null })
  festivalStartDate?: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  festivalEndDate?: Date | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  // Optional category grouping for the service.
  @Column({ type: 'int', nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => Category, (category) => category.services, {
    nullable: true,
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  // Optional temple grouping for the service.
  @Index()
  @Column({ type: 'int', nullable: true })
  templeId?: number | null;

  @ManyToOne(() => Temple, {
    nullable: true,
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn({ name: 'templeId' })
  temple?: Temple | null;

  @OneToMany(() => PurohitService, (purohitService) => purohitService.service)
  purohitServices!: PurohitService[];

  @OneToMany(() => Booking, (booking) => booking.service)
  bookings!: Booking[];

  @OneToMany(() => ServiceFeature, (serviceFeature) => serviceFeature.service)
  serviceFeatures!: ServiceFeature[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
