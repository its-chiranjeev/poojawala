import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RescheduleBookingDto {
  @IsDateString(
    {},
    {
      message: 'scheduledAt must be a valid ISO date string',
    },
  )
  scheduledAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'customerAddressId must be an integer',
  })
  @Min(1, {
    message: 'customerAddressId must be greater than zero',
  })
  customerAddressId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'Reason cannot exceed 500 characters',
  })
  reason?: string;
}
