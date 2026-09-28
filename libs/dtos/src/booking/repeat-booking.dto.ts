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
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SERVICE_PLAN } from '@poojawala/entities';

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
