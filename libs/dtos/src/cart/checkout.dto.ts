import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CheckoutDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bookingId must be an integer' })
  @Min(1, { message: 'bookingId must be at least 1' })
  bookingId?: number;
}
