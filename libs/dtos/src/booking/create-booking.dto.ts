import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerAddressId?: number;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialInstructions?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  couponCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  donationAmount?: number;
}