import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RescheduleBookingDto {
  @IsNotEmpty({ message: 'scheduledAt is required' })
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
  @Max(2147483647, {
    message: 'customerAddressId cannot exceed 2147483647',
  })
  customerAddressId?: number;

  @IsOptional()
  @IsString({
    message: 'Reason must be a string',
  })
  @MaxLength(500, {
    message: 'Reason cannot exceed 500 characters',
  })
  reason?: string;
}
