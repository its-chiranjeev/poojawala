import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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
