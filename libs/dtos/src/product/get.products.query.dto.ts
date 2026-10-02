import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CATEGORY_TYPE } from '@poojawala/entities';

export class GetProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  isActive?: string;

  /** Filter products by their category ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /**
   * Filter products by their category's type.
   * Only PRODUCT is supported. SERVICE category type is not allowed for product queries.
   * Example: ?categoryType=PRODUCT
   */
  @IsOptional()
  @IsIn([CATEGORY_TYPE.PRODUCT], {
    message: 'categoryType must be PRODUCT when querying products. SERVICE category type is not allowed.',
  })
  categoryType?: CATEGORY_TYPE;
}
