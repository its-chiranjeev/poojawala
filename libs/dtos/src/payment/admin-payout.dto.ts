import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminCreatePurohitPayoutDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  bookingId!: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
