import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bookingId must be an integer' })
  @Min(1, { message: 'bookingId must be at least 1' })
  @Max(2147483647, { message: 'bookingId cannot exceed 2147483647' })
  bookingId?: number;

  @Type(() => Number)
  @IsInt({ message: 'Rating must be an integer' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating cannot exceed 5' })
  rating!: number;

  @IsOptional()
  @IsString({ message: 'Review must be a string' })
  @MaxLength(1000, { message: 'Review cannot exceed 1000 characters' })
  review?: string;
}
