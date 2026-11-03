import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
  IsArray,
  IsInt,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PUROHIT_PAYMENT_METHOD, VENUE_TYPE } from '@poojawala/entities';
import { parseStringArray, parseIntArray } from './register-user.dto';

export class CreatePurohitByAdminDto {
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
  @Transform(({ value }) => parseIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  services?: number[];

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  serviceAreas?: any[];

  @IsOptional()
  serviceArea?: any;

  @IsOptional()
  address?: any;

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
  streetName?: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  serviceRadiusKm?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  isDefault?: boolean;

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

  // Identity document fields
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
  @Transform(({ value }) => value?.trim())
  templeAffiliationProof?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  templeAffiliationProofUrl?: string;

  // Bank & UPI fields
  @IsOptional()
  @IsEnum(PUROHIT_PAYMENT_METHOD)
  paymentMethod?: PUROHIT_PAYMENT_METHOD;

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
