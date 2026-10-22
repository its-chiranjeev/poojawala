import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { parseStringArray } from '../auth/register-user.dto';

export class RegisterAstrologerDto {
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Transform(({ value }) => value?.trim())
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

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
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
  specification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  /** Per minute consultation rate (e.g. ₹15.00/min) */
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

  /** Base astrology consultation price (e.g. ₹500.00) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  astrologyPrice?: number;

  /** Commission percentage applied to astrology consultation (e.g. 10.00%) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionPercentage?: number;

  /** Net astrologer payout (astrologyPrice - commissionPrice) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  astrologerPayout?: number;

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
