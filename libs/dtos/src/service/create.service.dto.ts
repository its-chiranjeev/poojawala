import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsDateString,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsNumber()
  @Min(0)
  minPrice!: number;

  @IsNumber()
  @Min(0)
  maxPrice!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage!: number;

  @IsNumber()
  @Min(1)
  durationMinutes!: number;

  @Transform(({ obj }) => obj.requiresVenue === 'true' || obj.requiresVenue === true)
  @IsBoolean()
  requiresVenue!: boolean;

  @Transform(({ obj }) => obj.isActive === 'true' || obj.isActive === true)
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
export class PurohitServiceItemDto {
  @IsInt()
  @Min(1)
  serviceId!: number;

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
export class CreatePurohitServiceDto {
  @IsArray()
  @ArrayNotEmpty()
  services!: any[];
}
