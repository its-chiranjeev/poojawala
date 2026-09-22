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

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  image?: any;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  /** The unit this product is priced per. e.g. PIECE, KG, PACK */
  @IsEnum(PRODUCT_PRICING_UNIT)
  pricingUnit!: PRODUCT_PRICING_UNIT;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return true;
    return raw === 'true' || raw === true;
  })
  @IsBoolean()
  isActive?: boolean;
}

