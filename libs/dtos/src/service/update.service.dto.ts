import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsInt,
  IsDateString,
  ValidateIf,
  IsNotEmpty,
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
  isActive?: boolean;

  @IsOptional()
  @Transform(({ obj }) => obj.isUpcomingFestival === 'true' || obj.isUpcomingFestival === true)
  @IsBoolean()
  isUpcomingFestival?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  festivalStartDate?: Date | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsDateString()
  festivalEndDate?: Date | null;
}

export class UpdatePurohitServiceDto {
  @IsOptional()
  @IsBoolean()
  isOnline!: boolean;

  @IsBoolean()
  isOffline!: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  onlinePrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  offlinePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

}

export class UpdateServiceStatusDto {
  @Transform(({ obj }) => obj.isActive === 'true' || obj.isActive === true)
  @IsBoolean()
  isActive!: boolean;
}
