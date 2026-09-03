import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { COMPLAINT_CATEGORY, COMPLAINT_STATUS } from '@poojawala/entities';

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
  @IsEnum(COMPLAINT_STATUS, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  status?: COMPLAINT_STATUS | COMPLAINT_STATUS[];

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