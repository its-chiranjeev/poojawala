import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PRODUCT_PRICING_UNIT } from '@poojawala/entities';

export class UpdateProductDto {
  @IsOptional()
  @IsString({ message: 'Product name must be a string' })
  @IsNotEmpty({ message: 'Product name cannot be empty' })
  @MaxLength(100, { message: 'Product name cannot exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Product description must be a string' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Meta title must be a string' })
  @MaxLength(255, { message: 'Meta title cannot exceed 255 characters' })
  metaTitle?: string;

  @IsOptional()
  @IsString({ message: 'Meta description must be a string' })
  @MaxLength(500, { message: 'Meta description cannot exceed 500 characters' })
  metaDescription?: string;

  @IsOptional()
  @IsString({ message: 'imageUrl must be a string' })
  imageUrl?: string;

  @IsOptional()
  image?: any;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'Price must be a valid number with at most 2 decimal places' },
  )
  @Min(0, { message: 'Price cannot be negative' })
  @Max(99999999.99, { message: 'Price cannot exceed 99,999,999.99' })
  price?: number;

  /** The unit this product is priced per. e.g. PIECE, KG, PACK */
  @IsOptional()
  @IsEnum(PRODUCT_PRICING_UNIT, {
    message: `pricingUnit must be one of: ${Object.values(PRODUCT_PRICING_UNIT).join(', ')}`,
  })
  pricingUnit?: PRODUCT_PRICING_UNIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(0, { message: 'Quantity cannot be negative' })
  @Max(2147483647, { message: 'Quantity cannot exceed 2147483647' })
  quantity?: number;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  /**
   * Optional: reassign the product to a different PRODUCT-type category.
   * Applies the same validation as create (active, non-deleted, PRODUCT type).
   * When omitted, the existing category assignment is preserved.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId must be an integer' })
  @Min(1, { message: 'categoryId must be at least 1' })
  @Max(2147483647, { message: 'categoryId cannot exceed 2147483647' })
  categoryId?: number;
}

export class UpdateProductStatusDto {
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive!: boolean;
}
