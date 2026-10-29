import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRefundDto {
  @Type(() => Number)
  @IsNumber(
    {
      allowNaN: false,
      allowInfinity: false,
      maxDecimalPlaces: 2,
    },
    {
      message: 'Refund amount must be a valid number with at most 2 decimal places',
    },
  )
  @Min(0.01, { message: 'Refund amount must be at least 0.01' })
  @Max(99999999.99, { message: 'Refund amount cannot exceed 99,999,999.99' })
  amount!: number;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(255, { message: 'Reason cannot exceed 255 characters' })
  reason?: string;

  @IsOptional()
  @IsString({ message: 'idempotencyKey must be a string' })
  @MaxLength(100, { message: 'idempotencyKey cannot exceed 100 characters' })
  idempotencyKey?: string;
}
