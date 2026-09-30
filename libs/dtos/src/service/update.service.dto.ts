import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsInt,
  IsDateString,
  ValidateIf,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import type { ServicePlans } from '@poojawala/entities';
import {
  ServiceCityDto,
  ServiceLanguageDto,
  ServiceBenefitDto,
  parseJsonArray,
  deduplicateCities,
  deduplicateLanguages,
  deduplicateBenefits,
  parsePurohitCarryItems,
} from './create.service.dto';

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const deduped = deduplicateCities(parseJsonArray(value));
    return deduped ? plainToInstance(ServiceCityDto, deduped) : undefined;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceCityDto)
  cities?: ServiceCityDto[];

  @IsOptional()
  @Transform(({ value }) => {
    const deduped = deduplicateLanguages(parseJsonArray(value));
    return deduped ? plainToInstance(ServiceLanguageDto, deduped) : undefined;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceLanguageDto)
  languages?: ServiceLanguageDto[];

  @IsOptional()
  @Transform(({ value }) => {
    const deduped = deduplicateBenefits(parseJsonArray(value));
    return deduped ? plainToInstance(ServiceBenefitDto, deduped) : undefined;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceBenefitDto)
  benefits?: ServiceBenefitDto[];

  @IsOptional()
  @Transform(({ value }) => parsePurohitCarryItems(value))
  purohitCarryItems?: any;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  icon?: any;

  /**
   * Configurable service plans: partial update of 'basic' and/or 'standard'.
   */
  @IsOptional()
  @IsObject({ message: 'plans must be an object' })
  plans?: Partial<ServicePlans>;

  // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
  /*
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(1)
  priceWithoutSamagri?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(1)
  priceWithSamagri?: number;
  */

  // TODO: Legacy pricing fields.
  // Retained for backward compatibility.
  // New pricing logic must use priceWithoutSamagri / priceWithSamagri.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  tokenPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requiresVenue?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // NOTE: isGlobal is NOT exposed in the DTO.
  // Always auto-derived from cities in the service layer.

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isUpcomingFestival !== undefined ? obj.isUpcomingFestival : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === 'true' || raw === true;
  })
  @IsBoolean()
  isUpcomingFestival?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  festivalStartDate?: Date | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  festivalEndDate?: Date | null;

  /** Optional: assign or re-assign this service to a category. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;
}


export class UpdatePurohitServiceDto {
  // TODO: Deprecated with fixed service pricing. Purohit no longer configures online/offline mode or custom prices.
  // Payout is automatically calculated based on service.priceWithoutSamagri.
  // @IsOptional()
  // @IsBoolean()
  // isOnline!: boolean;

  // @IsBoolean()
  // isOffline!: boolean;

  // @IsOptional()
  // @IsNumber({ maxDecimalPlaces: 2 })
  // @Min(0)
  // onlinePrice?: number;

  // @IsOptional()
  // @IsNumber({ maxDecimalPlaces: 2 })
  // @Min(0)
  // offlinePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

}

export class UpdateServiceStatusDto {
  @Transform(({ obj }) => obj.isActive === 'true' || obj.isActive === true)
  @IsBoolean()
  isActive!: boolean;
}
