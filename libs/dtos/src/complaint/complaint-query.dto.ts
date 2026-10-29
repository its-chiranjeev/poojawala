import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { COMPLAINT_CATEGORY, COMPLAINT_STATUS } from '@poojawala/entities';

export class ComplaintQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit: number = 10;

  @IsOptional()
  @IsEnum(COMPLAINT_STATUS, { each: true, message: 'Status must be a valid complaint status' })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  status?: COMPLAINT_STATUS | COMPLAINT_STATUS[];

  @IsOptional()
  @IsEnum(COMPLAINT_CATEGORY, { message: `category must be one of: ${Object.values(COMPLAINT_CATEGORY).join(', ')}` })
  category?: COMPLAINT_CATEGORY;

  @IsOptional()
  @IsString({ message: 'search must be a string' })
  @MaxLength(100, { message: 'search cannot exceed 100 characters' })
  search?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid ISO date string' })
  fromDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid ISO date string' })
  toDate?: string;
}
