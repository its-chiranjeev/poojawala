import { Type, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BOOKING_STATUS, BOOKING_PAYMENT_STATUS } from '@poojawala/entities';

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
  @IsEnum(BOOKING_STATUS, {
    message: 'Status must be a valid booking status',
  })
  status?: BOOKING_STATUS;

  @IsOptional()
  @IsEnum(BOOKING_PAYMENT_STATUS, {
    message: 'Payment status must be a valid booking payment status',
  })
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS;

  @IsOptional()
  @IsEnum(BOOKING_PAYMENT_STATUS, {
    message: 'Purohit payout status must be a valid booking payment status',
  })
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS;
}