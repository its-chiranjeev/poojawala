import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COMPLAINT_CATEGORY } from '@poojawala/entities';

export class CreateComplaintDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const num = Number(value);
    return isNaN(num) ? value : num;
  })
  @IsInt()
  bookingId?: number;

  @IsOptional()
  @IsEnum(COMPLAINT_CATEGORY)
  category?: COMPLAINT_CATEGORY;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;
}