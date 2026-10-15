import { USER_ROLE, PUROHIT_PAYMENT_METHOD, VENUE_TYPE } from '@poojawala/entities';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength, registerDecorator, ValidationOptions, ValidationArguments, ValidateIf, IsNumber, Min, Max, IsArray } from 'class-validator';

export function parseStringArray(value: unknown): string[] | undefined {
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
        parsed = [trimmed];
      }
    } else if (trimmed.includes(',')) {
      parsed = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      parsed = [trimmed];
    }
  }

  if (Array.isArray(parsed)) {
    const result = parsed
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          const val =
            obj.city ||
            obj.addressLabel ||
            obj.name ||
            obj.fullAddress ||
            obj.area ||
            obj.value;
          if (typeof val === 'string') return val.trim();
        }
        return item;
      })
      .filter((item) => item !== null && item !== undefined && item !== '');
    return result;
  }

  return undefined;
}

export function parseIntArray(value: unknown): number[] | undefined {
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
        parsed = [trimmed];
      }
    } else if (trimmed.includes(',')) {
      parsed = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      parsed = [trimmed];
    }
  }

  if (Array.isArray(parsed)) {
    const result = parsed
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const val = (item as any).id ?? (item as any).serviceId ?? (item as any).value;
          return Number(val);
        }
        return Number(item);
      })
      .filter((item) => !Number.isNaN(item) && Number.isInteger(item));
    return result;
  }

  if (typeof parsed === 'number' && Number.isInteger(parsed)) {
    return [parsed];
  }

  return undefined;
}

export class OtpDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsEnum(USER_ROLE)
  @IsNotEmpty()
  @Transform(({ value }) => value.toUpperCase())
  role!: USER_ROLE;
}

export class RegisterUserDto extends OtpDto { }

export class RegisterNormalUserDto {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? Number(value) : undefined)
  id?: number;

  @ValidateIf(o => !o.id)
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  // @IsOptional()
  // @IsString()
  // @IsNotEmpty()
  // @Transform(({ value }) => value?.trim())
  // otp!: string;


  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ratePerMinute?: number;


  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  specification?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  username?: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  firstName!: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  lastName!: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  @Match('password', { message: 'Passwords do not match' })
  confirmPassword!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsString({ each: true })
  qualification?: string[];

  @IsOptional()
  experienceYears?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
      return undefined;
    }
    return typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;
  })
  @IsString()
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  aadhaarDoc?: string;

  @IsOptional()
  @IsString()
  panDoc?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsString()
  templeAffiliationProof?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  city?: string;

  @IsOptional()
  languages?: string[];

  @IsOptional()
  isOnlineAvailable?: string;

  @IsOptional()
  isOfflineAvailable?: string;

  @IsOptional()
  specializations?: string[];

  @ValidateIf(o => !o.id)
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  birthPlace?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  rashi?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  gotra?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  ifscCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  bankName?: string;

  @IsOptional()
  @IsEnum(PUROHIT_PAYMENT_METHOD)
  paymentMethod?: PUROHIT_PAYMENT_METHOD;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  upiId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  fullAddress?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  addressLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  state?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  pincode?: string;

  @IsOptional()
  @IsEnum(VENUE_TYPE)
  venueType?: VENUE_TYPE;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  isDefault?: boolean;

  @IsOptional()
  address?: any;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  streetName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  serviceRadiusKm?: number;

  @IsOptional()
  serviceArea?: any;
}

export class GenerateOtpDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsEnum(USER_ROLE)
  role!: USER_ROLE;
}

export class resetPasswordDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  otp!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;


}

export class forgotPasswordDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;
}

export function Match(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} must match ${relatedPropertyName}`;
        },
      },
    });
  };
}

// Verhoeff multiplication table
const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Verhoeff permutation table
const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Plain helper — usable anywhere (services, pipes, tests).
 * Accepts "234567890124", "2345 6789 0124" or "2345-6789-0124".
 */
export function isValidAadhaar(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const num = value.replace(/[\s-]/g, '');

  // 12 digits, first digit cannot be 0 or 1
  if (!/^[2-9]\d{11}$/.test(num)) return false;

  let c = 0;
  const digits = num.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(digits[i])]];
  }
  return c === 0;
}

/**
 * class-validator decorator.
 *
 * Usage:
 *   @IsOptional()
 *   @IsAadhaar()
 *   aadhaarNumber?: string;
 */
export function IsAadhaar(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAadhaar',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid Aadhaar number`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => isValidAadhaar(value),
      },
    });
  };
}
