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
  Max,
  IsIn,
  ValidateNested,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { BOOKING_PAYMENT_TYPE, SERVICE_PLAN } from '@poojawala/entities';
import { CreateCustomerAddressDto } from '../user/add-customer-address.dto';

export class CreateBookingDto {
  @Type(() => Number)
  @IsInt({ message: 'serviceId must be an integer' })
  @Min(1, { message: 'serviceId must be at least 1' })
  @Max(2147483647, { message: 'serviceId cannot exceed 2147483647' })
  serviceId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'customerAddressId must be an integer' })
  @Min(1, { message: 'customerAddressId must be at least 1' })
  @Max(2147483647, { message: 'customerAddressId cannot exceed 2147483647' })
  customerAddressId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerAddressDto)
  address?: CreateCustomerAddressDto;

  @IsNotEmpty({ message: 'scheduledAt is required' })
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO date string' })
  scheduledAt!: string;

  @IsString({ message: 'bookingMode must be a string' })
  @IsIn(['ONLINE', 'OFFLINE'], { message: 'bookingMode must be either ONLINE or OFFLINE' })
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
  @IsBoolean({ message: 'samagriIncluded must be a boolean' })
  samagriIncluded?: boolean;

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

  @IsNotEmpty({ message: 'paymentOption is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn([BOOKING_PAYMENT_TYPE.TOKEN, BOOKING_PAYMENT_TYPE.FULL], {
    message: 'paymentOption must be either TOKEN or FULL',
  })
  paymentOption?: BOOKING_PAYMENT_TYPE.TOKEN | BOOKING_PAYMENT_TYPE.FULL;

  @IsOptional()
  @IsArray({ message: 'featureIds must be an array' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Each featureId must be an integer' })
  @Min(1, { each: true, message: 'Each featureId must be at least 1' })
  @Max(2147483647, { each: true, message: 'Each featureId cannot exceed 2147483647' })
  featureIds?: number[];
}
