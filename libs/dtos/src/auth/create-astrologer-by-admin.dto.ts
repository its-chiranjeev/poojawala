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
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

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
  @IsString()
  upiId?: string;

  @IsOptional()
  bankAccount?: any;

  @IsOptional()
  bankAccounts?: any[];
}
