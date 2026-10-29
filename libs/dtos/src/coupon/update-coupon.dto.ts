import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DISCOUNT_TYPE } from '@poojawala/entities';

export class UpdateCouponDto {
  @IsOptional()
  @IsString({ message: 'Coupon code must be a string' })
  @MaxLength(50, { message: 'Coupon code cannot exceed 50 characters' })
  code?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsEnum(DISCOUNT_TYPE, {
    message: `discountType must be one of: ${Object.values(DISCOUNT_TYPE).join(', ')}`,
  })
  discountType?: DISCOUNT_TYPE;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'discountValue must be a valid number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'discountValue must be greater than 0' })
  @Max(99999999.99, { message: 'discountValue cannot exceed 99,999,999.99' })
  discountValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'maxDiscountAmount must be a valid number with at most 2 decimal places' },
  )
  @Min(1, { message: 'maxDiscountAmount must be at least 1' })
  @Max(99999999.99, { message: 'maxDiscountAmount cannot exceed 99,999,999.99' })
  maxDiscountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'minBookingAmount must be a valid number with at most 2 decimal places' },
  )
  @Min(0, { message: 'minBookingAmount cannot be negative' })
  @Max(99999999.99, { message: 'minBookingAmount cannot exceed 99,999,999.99' })
  minBookingAmount?: number;

  @IsOptional()
  @IsArray({ message: 'applicableServiceIds must be an array' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Each applicableServiceId must be an integer' })
  @Min(1, { each: true, message: 'Each applicableServiceId must be at least 1' })
  @Max(2147483647, { each: true, message: 'Each applicableServiceId cannot exceed 2147483647' })
  applicableServiceIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'usageLimitTotal must be an integer' })
  @Min(1, { message: 'usageLimitTotal must be at least 1' })
  @Max(2147483647, { message: 'usageLimitTotal cannot exceed 2147483647' })
  usageLimitTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'usageLimitPerCustomer must be an integer' })
  @Min(1, { message: 'usageLimitPerCustomer must be at least 1' })
  @Max(2147483647, { message: 'usageLimitPerCustomer cannot exceed 2147483647' })
  usageLimitPerCustomer?: number;

  @IsOptional()
  @IsDateString({}, { message: 'validFrom must be a valid ISO date string' })
  validFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'validUntil must be a valid ISO date string' })
  validUntil?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

