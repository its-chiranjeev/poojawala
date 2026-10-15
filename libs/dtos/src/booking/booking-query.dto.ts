import { Type, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BOOKING_STATUS, BOOKING_PAYMENT_STATUS, BOOKING_TYPE } from '@poojawala/entities';

export class BookingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'Page must be an integer',
  })
  @Min(1, {
    message: 'Page must be at least 1',
  })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'Limit must be an integer',
  })
  @Min(1, {
    message: 'Limit must be at least 1',
  })
  @Max(100, {
    message: 'Limit cannot exceed 100',
  })
  limit: number = 10;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim()
      : value,
  )
  @IsString({
    message: 'Search must be a string',
  })
  @MaxLength(100, {
    message: 'Search cannot exceed 100 characters',
  })
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_STATUS, {
    each: true,
    message: 'Status must be a valid booking status',
  })
  status?: BOOKING_STATUS | BOOKING_STATUS[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, {
    each: true,
    message: 'Payment status must be a valid booking payment status',
  })
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(v => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, {
    each: true,
    message: 'Purohit payout status must be a valid booking payment status',
  })
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      if (value.includes(',')) {
        return value.split(',').map(v => v.trim());
      }
      return value.trim();
    }
    return value;
  })
  @IsEnum(BOOKING_TYPE, {
    each: true,
    message: 'Booking type must be a valid booking type',
  })
  bookingType?: BOOKING_TYPE | BOOKING_TYPE[];
}