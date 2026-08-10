import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsInt
} from 'class-validator';

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requiresVenue?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsOnline?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsOffline?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePurohitServiceDto{
 @IsOptional()
 @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  customPrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

} 
 
export class UpdateServiceStatusDto {
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive!: boolean;
}
