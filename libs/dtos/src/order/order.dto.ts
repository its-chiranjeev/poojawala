import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import {
  ORDER_STATUS,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
} from '@poojawala/entities';

export class GetOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ORDER_STATUS)
  orderStatus?: ORDER_STATUS;

  @IsOptional()
  @IsEnum(ORDER_PAYMENT_STATUS)
  paymentStatus?: ORDER_PAYMENT_STATUS;

  @IsOptional()
  @IsEnum(ORDER_PAYMENT_METHOD)
  paymentMethod?: ORDER_PAYMENT_METHOD;

  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Admin-only filter to filter by customer
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;
}

export class UpdateOrderStatusDto {
  @IsEnum(ORDER_STATUS, {
    message: 'Valid orderStatus is required',
  })
  status!: ORDER_STATUS;
}

export class CollectCodPaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'collectedAmount must be a number' })
  @IsPositive({ message: 'collectedAmount must be positive' })
  collectedAmount?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
