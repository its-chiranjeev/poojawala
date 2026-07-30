import { IsOptional, IsString, MaxLength, MinLength, } from 'class-validator';
import { Transform } from 'class-transformer';

export class CancelBookingDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({
    message: 'Cancellation reason must be a string',
  })
  @MinLength(3, {
    message:
      'Cancellation reason must contain at least 3 characters',
  })
  @MaxLength(500, {
    message:
      'Cancellation reason cannot exceed 500 characters',
  })
  cancellationReason?: string;
}