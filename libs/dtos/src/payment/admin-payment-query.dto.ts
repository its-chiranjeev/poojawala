import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  BOOKING_PAYMENT_STATUS,
  BOOKING_TYPE,
} from '@poojawala/entities';

export class AdminPaymentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit: number = 10;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(PAYMENT_STATUS, { each: true, message: 'Status must be a valid payment status' })
  status?: PAYMENT_STATUS | PAYMENT_STATUS[];

  @IsOptional()
  @IsEnum(PAYMENT_TYPE, { message: 'paymentType must be a valid payment type' })
  paymentType?: PAYMENT_TYPE;

  @IsOptional()
  @IsEnum(PAYMENT_METHOD, { message: 'paymentMethod must be a valid payment method' })
  paymentMethod?: PAYMENT_METHOD;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bookingId must be an integer' })
  @Min(1, { message: 'bookingId must be at least 1' })
  @Max(2147483647, { message: 'bookingId cannot exceed 2147483647' })
  bookingId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'customerId must be an integer' })
  @Min(1, { message: 'customerId must be at least 1' })
  @Max(2147483647, { message: 'customerId cannot exceed 2147483647' })
  customerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'purohitId must be an integer' })
  @Min(1, { message: 'purohitId must be at least 1' })
  @Max(2147483647, { message: 'purohitId cannot exceed 2147483647' })
  purohitId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'astrologerId must be an integer' })
  @Min(1, { message: 'astrologerId must be at least 1' })
  @Max(2147483647, { message: 'astrologerId cannot exceed 2147483647' })
  astrologerId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (value.includes(',')) {
        return value.split(',').map((v) => v.trim());
      }
      return value.trim();
    }
    return value;
  })
  @IsEnum(BOOKING_TYPE, { each: true, message: 'bookingType must be a valid booking type' })
  bookingType?: BOOKING_TYPE | BOOKING_TYPE[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'search must be a string' })
  @MaxLength(100, { message: 'search cannot exceed 100 characters' })
  search?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid ISO date string' })
  fromDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid ISO date string' })
  toDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, { each: true, message: 'partnerPayoutStatus must be a valid booking payment status' })
  partnerPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, { each: true, message: 'purohitPayoutStatus must be a valid booking payment status' })
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, { each: true, message: 'bookingPaymentStatus must be a valid booking payment status' })
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
}
