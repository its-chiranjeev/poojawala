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
import { Type } from 'class-transformer';

export class RepeatBookingDto {
  @IsDateString(
    {},
    {
      message: 'scheduledAt must be a valid ISO date string',
    },
  )
  scheduledAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'customerAddressId must be an integer',
  })
  @Min(1, {
    message: 'customerAddressId must be greater than zero',
  })
  customerAddressId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Special instructions cannot exceed 1000 characters',
  })
  specialInstructions?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {
      maxDecimalPlaces: 2,
    },
    {
      message: 'Donation amount must be a valid number',
    },
  )
  @Min(0, {
    message: 'Donation amount cannot be negative',
  })
  donationAmount?: number;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
