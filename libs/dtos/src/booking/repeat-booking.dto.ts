import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SERVICE_PLAN } from '@poojawala/entities';

export class RepeatBookingDto {
  @IsNotEmpty({ message: 'scheduledAt is required' })
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
  @Max(2147483647, {
    message: 'customerAddressId cannot exceed 2147483647',
  })
  customerAddressId?: number;

  @IsOptional()
  @IsString({
    message: 'Special instructions must be a string',
  })
  @MaxLength(1000, {
    message: 'Special instructions cannot exceed 1000 characters',
  })
  specialInstructions?: string;

  @IsOptional()
  @IsObject({
    message: 'customFields must be an object',
  })
  customFields?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    {
      allowNaN: false,
      allowInfinity: false,
      maxDecimalPlaces: 2,
    },
    {
      message: 'Donation amount must be a valid number with at most 2 decimal places',
    },
  )
  @Min(0, {
    message: 'Donation amount cannot be negative',
  })
  @Max(99999999.99, {
    message: 'Donation amount cannot exceed 99,999,999.99',
  })
  donationAmount?: number;

  @IsOptional()
  @IsString({
    message: 'couponCode must be a string',
  })
  @MaxLength(30, {
    message: 'couponCode cannot exceed 30 characters',
  })
  couponCode?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(SERVICE_PLAN, {
    message: 'plan must be either BASIC or STANDARD',
  })
  plan?: SERVICE_PLAN;

  // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({
    message: 'samagriIncluded must be a boolean',
  })
  samagriIncluded?: boolean;
}
