import { Type } from 'class-transformer';
import { IsDateString, IsInt, Min } from 'class-validator';

export class CreateAstrologyBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  astrologerId!: number;

  @IsDateString()
  scheduledAt!: string;
}
