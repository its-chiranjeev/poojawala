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
  Max,
} from 'class-validator';

export class UpdateBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'serviceId must be an integer' })
  @Min(1, { message: 'serviceId must be at least 1' })
  @Max(2147483647, { message: 'serviceId cannot exceed 2147483647' })
  serviceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'customerAddressId must be an integer' })
  @Min(1, { message: 'customerAddressId must be at least 1' })
  @Max(2147483647, { message: 'customerAddressId cannot exceed 2147483647' })
  customerAddressId?: number;

  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO date string' })
  scheduledAt?: string;

  @IsOptional()
  @IsString({ message: 'specialInstructions must be a string' })
  @MaxLength(1000, { message: 'specialInstructions cannot exceed 1000 characters' })
  specialInstructions?: string;

  @IsOptional()
  @IsObject({ message: 'customFields must be an object' })
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsString({ message: 'couponCode must be a string' })
  @MaxLength(30, { message: 'couponCode cannot exceed 30 characters' })
  couponCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'Donation amount must be a valid number with at most 2 decimal places' },
  )
  @Min(0, { message: 'Donation amount cannot be negative' })
  @Max(99999999.99, { message: 'Donation amount cannot exceed 99,999,999.99' })
  donationAmount?: number;
}
