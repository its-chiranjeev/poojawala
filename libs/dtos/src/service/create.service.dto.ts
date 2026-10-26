// TODO: Previous separate Transform import kept for reference:
// import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
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
import { CATEGORY_TYPE } from '@poojawala/entities';

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
  if (value === undefined || value === 'undefined') {
    return undefined;
  }
  if (value === null || value === '' || value === 'null') {
    return [];
  }
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[]') return [];
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

export function parsePurohitCarryItems(value: unknown): any {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return undefined;
  }
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
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

  // If it's an object with plan keys (like { basic: [...], standard: [...] })
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        result[k] = v
          .map((item) => (typeof item === 'string' ? item.trim() : item))
          .filter(Boolean);
      } else if (typeof v === 'string') {
        result[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  // If it's a flat array
  if (Array.isArray(parsed)) {
    const result: any[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        const lower = trimmed.toLowerCase();
        if (trimmed && !seen.has(lower)) {
          seen.add(lower);
          result.push(trimmed);
        }
      } else if (item && typeof item === 'object') {
        result.push(item);
      }
    }
    return result;
  }

  return undefined;
}

export class CreateServiceDto {
  @IsString()
  name!: string;

  // TODO: Obsolete client-provided slug removed. Slugs are now automatically generated by the server from name.
  // @IsOptional()
  // @Transform(({ value }) => {
  //   if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
  //     return undefined;
  //   }
  //   return typeof value === 'string' ? value.trim() : value;
  // })
  // @IsString()
  // slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.cities !== undefined ? obj.cities : obj?.city !== undefined ? obj.city : value;
    if (raw === undefined || raw === 'undefined') return undefined;
    if (raw === null || raw === '' || raw === 'null') return [];
    const parsed = parseJsonArray(raw);
    if (parsed === undefined) return undefined;
    const deduped = deduplicateCities(parsed);
    return deduped !== undefined ? plainToInstance(ServiceCityDto, deduped) : [];
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceCityDto)
  cities?: ServiceCityDto[];

  @IsOptional()
  city?: any;

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
   * Configurable service plans: exactly 'basic' and 'standard'.
   */
  @IsDefined({ message: 'plans is required' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  })
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
    const raw = obj?.isOnline !== undefined ? obj.isOnline : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false' || raw === false) return false;
    return raw;
  })
  @IsBoolean({ message: 'isOnline must be a boolean' })
  isOnline?: boolean;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isOffline !== undefined ? obj.isOffline : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false' || raw === false) return false;
    return raw;
  })
  @IsBoolean({ message: 'isOffline must be a boolean' })
  isOffline?: boolean;

  // NOTE: isGlobal is NOT exposed in the DTO.
  // It is always auto-derived in the service:
  //   isGlobal = true  → cities array is empty (available everywhere)
  //   isGlobal = false → cities array has entries (city-specific service)

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

  /** Optional: assign this service to a category. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** Optional: assign this service to a temple. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
      return undefined;
    }
    const num = Number(value);
    return isNaN(num) ? value : num;
  })
  @IsInt()
  @Min(1)
  templeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
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

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return true;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  isActive?: boolean;

  /**
   * Determines whether this is a SERVICE or PRODUCT category.
   * Defaults to SERVICE when omitted — ensures existing callers
   * that do not supply categoryType continue to create SERVICE categories.
   */
  @IsOptional()
  @IsEnum(CATEGORY_TYPE, { message: `categoryType must be one of: ${Object.values(CATEGORY_TYPE).join(', ')}` })
  categoryType?: CATEGORY_TYPE;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  isActive?: boolean;

  /**
   * Updating categoryType is intentionally allowed via the DTO but guarded
   * at the service layer: changing SERVICE→PRODUCT is blocked when services
   * are assigned; changing PRODUCT→SERVICE is blocked when products are assigned.
   */
  @IsOptional()
  @IsEnum(CATEGORY_TYPE, { message: `categoryType must be one of: ${Object.values(CATEGORY_TYPE).join(', ')}` })
  categoryType?: CATEGORY_TYPE;
}

// Backward-compat aliases — remove once all direct imports are updated
export { CreateCategoryDto as CreateServiceCategoryDto };
export { UpdateCategoryDto as UpdateServiceCategoryDto };
