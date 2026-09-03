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
} from '@poojawala/entities';

export class AdminPaymentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(PAYMENT_STATUS, { each: true })
  status?: PAYMENT_STATUS | PAYMENT_STATUS[];

  @IsOptional()
  @IsEnum(PAYMENT_TYPE)
  paymentType?: PAYMENT_TYPE;

  @IsOptional()
  @IsEnum(PAYMENT_METHOD)
  paymentMethod?: PAYMENT_METHOD;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bookingId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purohitId?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, { each: true })
  purohitPayoutStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  @IsEnum(BOOKING_PAYMENT_STATUS, { each: true })
  bookingPaymentStatus?: BOOKING_PAYMENT_STATUS | BOOKING_PAYMENT_STATUS[];
}
