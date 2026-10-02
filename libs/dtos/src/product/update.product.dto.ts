import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PRODUCT_PRICING_UNIT } from '@poojawala/entities';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  image?: any;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  /** The unit this product is priced per. e.g. PIECE, KG, PACK */
  @IsOptional()
  @IsEnum(PRODUCT_PRICING_UNIT)
  pricingUnit?: PRODUCT_PRICING_UNIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === 'true' || raw === true;
  })
  @IsBoolean()
  isActive?: boolean;

  /**
   * Optional: reassign the product to a different PRODUCT-type category.
   * Applies the same validation as create (active, non-deleted, PRODUCT type).
   * When omitted, the existing category assignment is preserved.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}

export class UpdateProductStatusDto {
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    return raw === 'true' || raw === true;
  })
  @IsBoolean()
  isActive!: boolean;
}
