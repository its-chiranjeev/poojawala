import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';

export class AdminCreatePurohitPayoutDto {
  @Type(() => Number)
  @IsInt({ message: 'bookingId must be an integer' })
  @Min(1, { message: 'bookingId must be at least 1' })
  @Max(2147483647, { message: 'bookingId cannot exceed 2147483647' })
  @IsNotEmpty({ message: 'bookingId is required' })
  bookingId!: number;

  @IsOptional()
  @IsString({ message: 'remark must be a string' })
  @MaxLength(500, { message: 'remark cannot exceed 500 characters' })
  remark?: string;
}
