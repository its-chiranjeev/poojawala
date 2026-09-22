import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AddToCartDto {
  @Type(() => Number)
  @IsInt({ message: 'productId must be an integer' })
  @Min(1, { message: 'productId must be at least 1' })
  productId!: number;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity!: number;
}
