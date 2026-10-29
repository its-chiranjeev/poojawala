import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PAYMENT_STATUS, PAYMENT_TYPE, BOOKING_PAYMENT_STATUS } from '@poojawala/entities';

export class PaymentQueryDto {
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'search must be a string' })
  @MaxLength(100, { message: 'search cannot exceed 100 characters' })
  search?: string;

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
