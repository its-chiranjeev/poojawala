import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DISCOUNT_TYPE } from '@likemyproduct/entities';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(DISCOUNT_TYPE)
  discountType!: DISCOUNT_TYPE;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  discountValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxDiscountAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBookingAmount!: number;

  @IsArray()
  @Type(() => Number)
  applicableServiceIds!: number[];

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  usageLimitTotal!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  usageLimitPerCustomer!: number;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validUntil!: string;

  @IsBoolean()
  isActive!: boolean;
}