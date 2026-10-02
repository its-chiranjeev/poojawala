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
import { Category } from './service-category.entity';

/**
 * Defines the unit against which the product price is measured.
 * price = cost of one pricingUnit.
 *
 * Examples:
 *   price = 600, pricingUnit = KG  → ₹600 / KG
 *   price = 10,  pricingUnit = PIECE → ₹10 / piece
 *   price = 50,  pricingUnit = PACK  → ₹50 / pack
 *
 * Weight-based normalization (e.g. GRAM → KG) will be handled
 * at the purchase/booking calculation layer in a future step.
 */
export enum PRODUCT_PRICING_UNIT {
  PIECE = 'PIECE',   // Sold per individual piece (diya, idol, etc.)
  PACK  = 'PACK',    // Sold per pack/bundle (cotton batti, agarbatti, etc.)
  KG    = 'KG',      // Sold per kilogram (ghee, atta, etc.)
  GRAM  = 'GRAM',    // Sold per gram (saffron, chandan powder, etc.)
  LITER = 'LITER',   // Sold per litre (oil, gangajal, etc.)
  ML    = 'ML',      // Sold per millilitre (essential oils, etc.)
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  /**
   * The unit this product is priced per.
   * Nullable to stay backward-compatible with records created before this
   * field was added. Application code should treat null as PIECE.
   * New records must supply a value via the DTO.
   */
  @Column({
    type: 'enum',
    enum: PRODUCT_PRICING_UNIT,
    nullable: true,
    default: PRODUCT_PRICING_UNIT.PIECE,
  })
  pricingUnit?: PRODUCT_PRICING_UNIT | null;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // ─── Category relation ────────────────────────────────────────────────────

  /**
   * FK to service_categories.
   * Nullable for backward compatibility with existing products that were
   * created before this field was introduced.
   * New product creation MUST supply categoryId and it MUST reference a
   * PRODUCT-type category (enforced at the service layer).
   *
   * RESTRICT prevents orphaned products when a category is deleted.
   */
  @Column({ type: 'int', nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => Category, (cat) => cat.products, {
    nullable: true,
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  // ─── Timestamps ──────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
