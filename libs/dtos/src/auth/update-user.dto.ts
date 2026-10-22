import { IsEmail, IsDateString, IsOptional, IsString, IsEnum, IsArray, IsInt, IsNumber, Min } from 'class-validator';
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
  @IsNumber()
  @Min(0)
  ratePerMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  astrologyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
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
