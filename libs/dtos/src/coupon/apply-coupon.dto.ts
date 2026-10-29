import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ApplyCouponDto {
  @IsString({ message: 'Coupon code must be a string' })
  @IsNotEmpty({ message: 'Coupon code is required' })
  @MaxLength(50, { message: 'Coupon code cannot exceed 50 characters' })
  code!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'bookingAmount must be a valid number with at most 2 decimal places' },
  )
  @Min(0, { message: 'bookingAmount cannot be negative' })
  @Max(99999999.99, { message: 'bookingAmount cannot exceed 99,999,999.99' })
  bookingAmount?: number;
}

