import { Type, Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsBoolean } from 'class-validator';

export class GetServicesQueryDto {
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

  @IsOptional()
  @IsString()
  isUpcomingFestival?: string;

  /** Filter by global availability (true = no city restriction, false = city-specific). */
  @IsOptional()
  @IsString()
  isGlobal?: string;

  /** Filter services belonging to a specific category by ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** Filter services by category name, slug or ID. */
  @IsOptional()
  @IsString()
  category?: string;

  /** Filter services by multiple category IDs (e.g. "1,2,3"). */
  @IsOptional()
  @IsString()
  categories?: string;

  /** Filter categories containing a specific service by ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;

  /** Filter categories by service ID or slug. */
  @IsOptional()
  @IsString()
  service?: string;

  /** Whether to include child services in category results (e.g. "true"). */
  @IsOptional()
  @IsString()
  includeServices?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  language?: string;

  /**
   * Filter categories by type: SERVICE | PRODUCT | ALL.
   * When omitted or ALL, returns categories of all types (both SERVICE and PRODUCT).
   */
  @IsOptional()
  @IsString()
  categoryType?: string;
}

