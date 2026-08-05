import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COMPLAINT_CATEGORY } from '@likemyproduct/entities';

export class CreateComplaintDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bookingId?: number;

  @IsEnum(COMPLAINT_CATEGORY)
  category!: COMPLAINT_CATEGORY;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  linkedPaymentId?: number;
}