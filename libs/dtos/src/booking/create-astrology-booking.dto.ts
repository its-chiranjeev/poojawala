import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

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

  @IsDateString()
  scheduledAt!: string;
}
