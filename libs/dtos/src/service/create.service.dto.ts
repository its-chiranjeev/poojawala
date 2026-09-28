// TODO: Previous separate Transform import kept for reference:
// import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsDateString,
  ValidateIf,
  IsNotEmpty,
  ArrayNotEmpty,
  IsArray,
  ValidateNested,
  IsObject,
  IsDefined,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import type { ServicePlans } from '@poojawala/entities';

export function normalizeKey(str?: string): string {
  return str ? str.trim().toLowerCase() : '';
}

// TODO: Previous parseJsonArray implementation kept for reference:
/*
export function parseJsonArray<T>(value: unknown): T[] | undefined {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return undefined;
  }
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return undefined;
      }
    }
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as T[];
}
*/

export function parseJsonArray<T>(value: unknown): any[] | undefined {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return undefined;
  }
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return undefined;
      }
    } else if (trimmed.includes(',')) {
      parsed = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      parsed = [trimmed];
    }
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  return parsed;
}

export class ServiceCityDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class ServiceLanguageDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class ServiceBenefitDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export function deduplicateCities(cities?: any[]): ServiceCityDto[] | undefined {
  if (!cities || !Array.isArray(cities)) return undefined;
  const seen = new Set<string>();
  const result: ServiceCityDto[] = [];
  for (const c of cities) {
    const cityName = typeof c === 'string' ? c.trim() : (c && typeof c === 'object' ? (c.name || c.cityName || '').trim() : '');
    const stateName = c && typeof c === 'object' && c.state ? String(c.state).trim() : undefined;
    const key = normalizeKey(cityName);
    if (key && !seen.has(key)) {
      seen.add(key);
      const item = new ServiceCityDto();
      item.name = cityName;
      if (stateName) item.state = stateName;
      result.push(item);
    }
  }
  return result;
}

export function deduplicateLanguages(languages?: any[]): ServiceLanguageDto[] | undefined {
  if (!languages || !Array.isArray(languages)) return undefined;
  const seen = new Set<string>();
  const result: ServiceLanguageDto[] = [];
  for (const l of languages) {
    const langName = typeof l === 'string' ? l.trim() : (l && typeof l === 'object' ? (l.name || l.languageName || '').trim() : '');
    const codeName = l && typeof l === 'object' && l.code ? String(l.code).trim() : undefined;
    const key = normalizeKey(langName);
    if (key && !seen.has(key)) {
      seen.add(key);
      const item = new ServiceLanguageDto();
      item.name = langName;
      if (codeName) item.code = codeName;
      result.push(item);
    }
  }
  return result;
}

export function deduplicateBenefits(benefits?: any[]): ServiceBenefitDto[] | undefined {
  if (!benefits || !Array.isArray(benefits)) return undefined;
  const seen = new Set<string>();
  const result: ServiceBenefitDto[] = [];
  for (const b of benefits) {
    const title = typeof b === 'string' ? b.trim() : (b && typeof b === 'object' ? (b.title || b.name || '').trim() : '');
    const description = b && typeof b === 'object' && b.description ? String(b.description).trim() : undefined;
    const key = normalizeKey(title);
    if (key && !seen.has(key)) {
      seen.add(key);
      const item = new ServiceBenefitDto();
      item.title = title;
      if (description) item.description = description;
      result.push(item);
    }
  }
  return result;
}

export class CreateServiceDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

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

  /**
   * Configurable service plans: exactly 'basic' and 'standard'.
   */
  @IsDefined({ message: 'plans is required' })
  @IsObject({ message: 'plans must be an object' })
  plans!: ServicePlans;

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

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  tokenPercentage?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationMinutes!: number;

  @Transform(({ obj, value }) => {
    const raw = obj?.requiresVenue !== undefined ? obj.requiresVenue : value;
    return raw === 'true' || raw === true;
  })
  @IsBoolean()
  requiresVenue!: boolean;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return true;
    return raw === 'true' || raw === true;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isUpcomingFestival !== undefined ? obj.isUpcomingFestival : value;
    if (raw === undefined || raw === null || raw === '') return false;
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
export class PurohitServiceItemDto {
  @IsInt()
  @Min(1)
  serviceId!: number;

  // TODO: Deprecated with fixed service pricing. Purohit no longer decides price; payout is calculated from service.priceWithoutSamagri.
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
export class CreatePurohitServiceDto {
  @IsArray()
  @ArrayNotEmpty()
  services!: any[];
}
