import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
  Unique,
} from 'typeorm';
import { Service } from './service.entity';

/**
 * Discriminates whether a ServiceCategory is used for Services or Products.
 *
 * SERVICE → assigned to Service entities (existing behaviour, default)
 * PRODUCT → assigned to Product entities
 *
 * The composite unique constraint on (name, categoryType) allows the same
 * name to exist in both types, e.g. "Pooja" can be both a SERVICE and a
 * PRODUCT category simultaneously.
 */
export enum CATEGORY_TYPE {
  SERVICE = 'SERVICE',
  PRODUCT = 'PRODUCT',
}

/**
 * Composite unique index: same name is allowed across different types.
 * The old standalone @Index({ unique: true }) on `name` is removed so that
 * "Pooja (SERVICE)" and "Pooja (PRODUCT)" can coexist.
 *
 * IMPORTANT: TypeORM `synchronize: true` will DROP the old unique index on
 * `name` and CREATE the new composite unique index on (name, categoryType).
 * Existing rows (all SERVICE) will remain valid.
 */
@Unique('UQ_service_categories_name_type', ['name', 'categoryType'])
@Entity('service_categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  // NOTE: @Index({ unique: true }) removed — uniqueness is now enforced via
  // the composite constraint UQ_service_categories_name_type above.
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  iconUrl?: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * Determines which entity type this category belongs to.
   * Defaults to SERVICE for full backward compatibility with existing data.
   * New product categories must explicitly pass PRODUCT.
   */
  @Column({
    type: 'enum',
    enum: CATEGORY_TYPE,
    default: CATEGORY_TYPE.SERVICE,
  })
  categoryType!: CATEGORY_TYPE;

  // ─── Relations ──────────────────────────────────────────────────────────────

  @OneToMany(() => Service, (service) => service.category)
  services!: Service[];

  // NOTE: Products relation is declared here for TypeORM awareness.
  // The actual @ManyToOne lives on Product entity to avoid a circular import
  // issue; we use a lazy forward-ref string instead.
  @OneToMany('Product', 'category')
  products!: any[];

  // Computed / virtual fields (not persisted columns)
  totalServices?: number;
  totalProducts?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}

// Backward-compatible alias for existing imports
export { Category as ServiceCategory };
