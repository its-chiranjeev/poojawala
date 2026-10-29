import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, Min, Max } from 'class-validator';

export class CreateAstrologyBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'customerId must be an integer' })
  @Min(1, { message: 'customerId must be at least 1' })
  @Max(2147483647, { message: 'customerId cannot exceed 2147483647' })
  customerId?: number;

  @Type(() => Number)
  @IsInt({ message: 'astrologerId must be an integer' })
  @Min(1, { message: 'astrologerId must be at least 1' })
  @Max(2147483647, { message: 'astrologerId cannot exceed 2147483647' })
  astrologerId!: number;

  @IsNotEmpty({ message: 'scheduledAt is required' })
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO date string' })
  scheduledAt!: string;
}
