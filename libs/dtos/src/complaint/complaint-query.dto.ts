import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { COMPLAINT_CATEGORY, COMPLAINT_STATUS } from '@likemyproduct/entities';

export class ComplaintQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsEnum(COMPLAINT_STATUS)
  status?: COMPLAINT_STATUS;

  @IsOptional()
  @IsEnum(COMPLAINT_CATEGORY)
  category?: COMPLAINT_CATEGORY;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}