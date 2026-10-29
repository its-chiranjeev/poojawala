import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';

export class CreateAstrologyBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  astrologerId!: number;

  @IsNotEmpty({ message: 'scheduledAt is required' })
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO date string' })
  scheduledAt!: string;
}
