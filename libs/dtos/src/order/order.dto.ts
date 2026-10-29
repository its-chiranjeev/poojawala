import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import {
  ORDER_STATUS,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
} from '@poojawala/entities';

export class GetOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ORDER_STATUS, {
    message: `orderStatus must be one of: ${Object.values(ORDER_STATUS).join(', ')}`,
  })
  orderStatus?: ORDER_STATUS;

  @IsOptional()
  @IsEnum(ORDER_PAYMENT_STATUS, {
    message: `paymentStatus must be one of: ${Object.values(ORDER_PAYMENT_STATUS).join(', ')}`,
  })
  paymentStatus?: ORDER_PAYMENT_STATUS;

  @IsOptional()
  @IsEnum(ORDER_PAYMENT_METHOD, {
    message: `paymentMethod must be one of: ${Object.values(ORDER_PAYMENT_METHOD).join(', ')}`,
  })
  paymentMethod?: ORDER_PAYMENT_METHOD;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  @MaxLength(100, { message: 'Search cannot exceed 100 characters' })
  search?: string;

  /**
   * Admin-only filter to filter by customer
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'customerId must be an integer' })
  @Min(1, { message: 'customerId must be at least 1' })
  @Max(2147483647, { message: 'customerId cannot exceed 2147483647' })
  customerId?: number;
}

export class UpdateOrderStatusDto {
  @IsEnum(ORDER_STATUS, {
    message: `status must be one of: ${Object.values(ORDER_STATUS).join(', ')}`,
  })
  status!: ORDER_STATUS;
}

export class CollectCodPaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'collectedAmount must be a valid number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'collectedAmount must be positive' })
  @Max(99999999.99, { message: 'collectedAmount cannot exceed 99,999,999.99' })
  collectedAmount?: number;

  @IsOptional()
  @IsString({ message: 'remark must be a string' })
  @MaxLength(500, { message: 'remark cannot exceed 500 characters' })
  remark?: string;
}
