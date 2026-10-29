import { IsEmail, IsDateString, IsOptional, IsString, IsEnum, IsArray, IsInt, IsNumber, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { USER_ROLE, USER_STATUS, PUROHIT_PAYMENT_METHOD } from '@poojawala/entities';
import { Match, parseStringArray, parseIntArray } from './register-user.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsEnum(USER_ROLE)
  role?: USER_ROLE;

  @IsOptional()
  @IsEnum(USER_STATUS)
  status?: USER_STATUS;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @Match('password', { message: 'Passwords do not match' })
  confirmPassword?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  birthPlace?: string;

  @IsOptional()
  @IsString()
  rashi?: string;

  @IsOptional()
  @IsString()
  gotra?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsString({ each: true })
  qualification?: string[];

  @IsOptional()
  experienceYears?: number;

  @IsOptional()
  @IsString()
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  languages?: string[];

  @IsOptional()
  specializations?: string[];

  @IsOptional()
  isOnlineAvailable?: string;

  @IsOptional()
  isOfflineAvailable?: string;

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
  specification?: string;

  // Bank Details

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  ifscCode?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsEnum(PUROHIT_PAYMENT_METHOD)
  paymentMethod?: PUROHIT_PAYMENT_METHOD;

  @IsOptional()
  @IsString()
  upiId?: string;

  @IsOptional()
  @Transform(({ value }) => parseIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  services?: number[];

  @IsOptional()
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsString({ each: true })
  serviceAreas?: string[];

  @IsOptional()
  profile?: any;

  @IsOptional()
  bankAccount?: any;

  @IsOptional()
  bankAccounts?: any[];

  @IsOptional()
  addresses?: any[];

  @IsOptional()
  purohitServices?: any[];

  @IsOptional()
  verificationStatus?: any;

  @IsOptional()
  rejectionReason?: any;

  @IsOptional()
  id?: any;

  @IsOptional()
  createdAt?: any;

  @IsOptional()
  updatedAt?: any;
}

export class UpdateUserStatusDto {
  @IsEnum(USER_STATUS)
  status!: USER_STATUS;
}
