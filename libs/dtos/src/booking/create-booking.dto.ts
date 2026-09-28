import { Transform, Type } from 'class-transformer';
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
import { SERVICE_PLAN } from '@poojawala/entities';

export enum BOOKING_PAYMENT_OPTION {
  TOKEN = 'TOKEN',
  FULL = 'FULL',
}

export class CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerAddressId!: number;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  @IsIn(['ONLINE', 'OFFLINE'])
  bookingMode!: 'ONLINE' | 'OFFLINE';

  @IsString({ message: 'plan must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(SERVICE_PLAN, { message: 'plan must be either BASIC or STANDARD' })
  plan!: SERVICE_PLAN;

  // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  samagriIncluded?: boolean;

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

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(BOOKING_PAYMENT_OPTION, { message: 'paymentOption must be either TOKEN or FULL' })
  paymentOption?: BOOKING_PAYMENT_OPTION;
}