import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
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

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  supportsOnline!: boolean;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  supportsOffline!: boolean;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  requiresVenue!: boolean;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
export class PurohitServiceItemDto {
  @IsInt()
  @Min(1)
  serviceId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  customPrice: number;

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
  services: any[];
}
