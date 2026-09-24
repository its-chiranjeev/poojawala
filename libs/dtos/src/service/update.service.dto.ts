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
} from 'class-validator';
import {
  ServiceCityDto,
  ServiceLanguageDto,
  ServiceBenefitDto,
  parseJsonArray,
  deduplicateCities,
  deduplicateLanguages,
  deduplicateBenefits,
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
  @IsString()
  iconUrl?: string;

  @IsOptional()
  icon?: any;

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
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requiresVenue?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
}

export class UpdatePurohitServiceDto {
  @IsOptional()
  @IsBoolean()
  isOnline!: boolean;

  @IsBoolean()
  isOffline!: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  onlinePrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  offlinePrice?: number;

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
