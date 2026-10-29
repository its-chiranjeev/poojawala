import { Type, Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class GetServicesQueryDto {
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
  @IsString({ message: 'isActive must be a string or boolean representation' })
  isActive?: string;

  @IsOptional()
  @IsString({ message: 'isUpcomingFestival must be a string or boolean representation' })
  isUpcomingFestival?: string;

  /** Filter by global availability (true = no city restriction, false = city-specific). */
  @IsOptional()
  @IsString({ message: 'isGlobal must be a string or boolean representation' })
  isGlobal?: string;

  /** Filter by online availability (true = offered online, false = not online). */
  @IsOptional()
  @IsString({ message: 'isOnline must be a string or boolean representation' })
  isOnline?: string;

  /** Filter by offline availability (true = offered offline, false = not offline). */
  @IsOptional()
  @IsString({ message: 'isOffline must be a string or boolean representation' })
  isOffline?: string;

  /** Filter services belonging to a specific category by ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId must be an integer' })
  @Min(1, { message: 'categoryId must be at least 1' })
  @Max(2147483647, { message: 'categoryId cannot exceed 2147483647' })
  categoryId?: number;

  /** Filter services by category name, slug or ID. */
  @IsOptional()
  @IsString({ message: 'category must be a string' })
  @MaxLength(100, { message: 'category cannot exceed 100 characters' })
  category?: string;

  /** Filter services by multiple category IDs (e.g. "1,2,3"). */
  @IsOptional()
  @IsString({ message: 'categories must be a comma-separated string of IDs' })
  @MaxLength(255, { message: 'categories cannot exceed 255 characters' })
  categories?: string;

  /** Filter services belonging to a specific temple by ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'templeId must be an integer' })
  @Min(1, { message: 'templeId must be at least 1' })
  @Max(2147483647, { message: 'templeId cannot exceed 2147483647' })
  templeId?: number;

  /** Filter services by temple name, ID, or 'all'. */
  @IsOptional()
  @IsString({ message: 'temple must be a string' })
  @MaxLength(100, { message: 'temple cannot exceed 100 characters' })
  temple?: string;

  /**
   * Filter services by temple association:
   * 'true': return services with non-null templeId (temple-linked services).
   * 'false': return services with null templeId (independent services).
   * When omitted: return services as-is without filtering by templeId presence.
   */
  @IsOptional()
  @IsString({ message: 'includeTemple must be a string' })
  includeTemple?: string;

  /** Filter categories containing a specific service by ID. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'serviceId must be an integer' })
  @Min(1, { message: 'serviceId must be at least 1' })
  @Max(2147483647, { message: 'serviceId cannot exceed 2147483647' })
  serviceId?: number;

  /** Filter categories by service ID or slug. */
  @IsOptional()
  @IsString({ message: 'service must be a string' })
  @MaxLength(100, { message: 'service cannot exceed 100 characters' })
  service?: string;

  /** Whether to include child services in category results (e.g. "true"). */
  @IsOptional()
  @IsString({ message: 'includeServices must be a string' })
  includeServices?: string;

  @IsOptional()
  @IsString({ message: 'city must be a string' })
  @MaxLength(100, { message: 'city cannot exceed 100 characters' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'state must be a string' })
  @MaxLength(100, { message: 'state cannot exceed 100 characters' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'language must be a string' })
  @MaxLength(50, { message: 'language cannot exceed 50 characters' })
  language?: string;

  /**
   * Filter categories by type: SERVICE | PRODUCT | ALL.
   * When omitted or ALL, returns categories of all types (both SERVICE and PRODUCT).
   */
  @IsOptional()
  @IsString({ message: 'categoryType must be a string' })
  @MaxLength(50, { message: 'categoryType cannot exceed 50 characters' })
  categoryType?: string;
}
