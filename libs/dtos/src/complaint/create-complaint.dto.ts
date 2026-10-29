import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { COMPLAINT_CATEGORY } from '@poojawala/entities';

export class CreateComplaintDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bookingId must be an integer' })
  @Min(1, { message: 'bookingId must be at least 1' })
  @Max(2147483647, { message: 'bookingId cannot exceed 2147483647' })
  bookingId?: number;

  @IsOptional()
  @IsEnum(COMPLAINT_CATEGORY, {
    message: `category must be one of: ${Object.values(COMPLAINT_CATEGORY).join(', ')}`,
  })
  category?: COMPLAINT_CATEGORY;

  @IsOptional()
  @IsString({ message: 'subject must be a string' })
  @MaxLength(200, { message: 'subject cannot exceed 200 characters' })
  subject?: string;

  @IsString({ message: 'description must be a string' })
  @MinLength(10, { message: 'description must be at least 10 characters long' })
  @MaxLength(5000, { message: 'description cannot exceed 5000 characters' })
  description!: string;
}
