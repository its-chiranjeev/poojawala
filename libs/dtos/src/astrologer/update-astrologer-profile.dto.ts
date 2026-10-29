import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { PUROHIT_VERIFICATION_STATUS } from '@poojawala/entities';

export class UpdateAstrologerProfileDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualification?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
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
  @MaxLength(255)
  aadhaarDocUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  panDocUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  certificateUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

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
  @IsEnum(PUROHIT_VERIFICATION_STATUS)
  verificationStatus?: PUROHIT_VERIFICATION_STATUS;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
