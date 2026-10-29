import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { CATEGORY_TYPE } from '@poojawala/entities';

export class GetProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit = 10;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  @MaxLength(100, { message: 'Search cannot exceed 100 characters' })
  search?: string;

  @IsOptional()
  @IsString({ message: 'isActive must be a string' })
  isActive?: string;

  /** Filter products by their category ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId must be an integer' })
  @Min(1, { message: 'categoryId must be at least 1' })
  @Max(2147483647, { message: 'categoryId cannot exceed 2147483647' })
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
