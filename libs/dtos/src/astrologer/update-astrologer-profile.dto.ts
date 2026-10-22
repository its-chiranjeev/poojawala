import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
  @IsEnum(PUROHIT_VERIFICATION_STATUS)
  verificationStatus?: PUROHIT_VERIFICATION_STATUS;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
