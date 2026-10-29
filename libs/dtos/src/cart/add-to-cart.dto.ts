import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

export class AddToCartDto {
  @Type(() => Number)
  @IsInt({ message: 'productId must be an integer' })
  @Min(1, { message: 'productId must be at least 1' })
  @Max(2147483647, { message: 'productId cannot exceed 2147483647' })
  productId!: number;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(10000, { message: 'quantity cannot exceed 10000' })
  quantity!: number;
}
