import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(10000, { message: 'quantity cannot exceed 10000' })
  quantity!: number;
}
