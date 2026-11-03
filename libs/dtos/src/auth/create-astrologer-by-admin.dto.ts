import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { parseStringArray } from './register-user.dto';

export class CreateAstrologerByAdminDto {
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
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  lastName!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  username?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  confirmPassword?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

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
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsString({ each: true })
  education?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  specification?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  city?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  state?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  isOnlineAvailable?: boolean | string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  isOfflineAvailable?: boolean | string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
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
  @Transform(({ value }) => value?.trim())
  profileImage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'ratePerMinute must be a valid number with at most 2 decimal places' })
  @Min(0, { message: 'ratePerMinute cannot be negative' })
  @Max(99999999.99, { message: 'ratePerMinute cannot exceed 99,999,999.99' })
  ratePerMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'commissionPrice must be a valid number with at most 2 decimal places' })
  @Min(0, { message: 'commissionPrice cannot be negative' })
  @Max(99999999.99, { message: 'commissionPrice cannot exceed 99,999,999.99' })
  commissionPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'astrologyPrice must be a valid number with at most 2 decimal places' })
  @Min(0, { message: 'astrologyPrice cannot be negative' })
  @Max(99999999.99, { message: 'astrologyPrice cannot exceed 99,999,999.99' })
  astrologyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'commissionPercentage must be a valid number with at most 2 decimal places' })
  @Min(0, { message: 'commissionPercentage cannot be negative' })
  @Max(100, { message: 'commissionPercentage cannot exceed 100' })
  commissionPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'astrologerPayout must be a valid number with at most 2 decimal places' })
  @Min(0, { message: 'astrologerPayout cannot be negative' })
  @Max(99999999.99, { message: 'astrologerPayout cannot exceed 99,999,999.99' })
  astrologerPayout?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  aadhaarDoc?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  aadhaarDocUrl?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  panDoc?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  panDocUrl?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  panNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  certificate?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  certificateUrl?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  ifscCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  bankName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  accountType?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  upiId?: string;

  @IsOptional()
  bankAccount?: any;

  @IsOptional()
  bankAccounts?: any[];
}
