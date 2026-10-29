import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { TEMPLE_VERIFICATION_STATUS } from '@poojawala/entities';

export class GetTemplesQueryDto {
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
  @IsString({ message: 'Search must be a string' })
  @MaxLength(100, { message: 'Search cannot exceed 100 characters' })
  search?: string;

  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'State must be a string' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const str = String(value).trim().toLowerCase();
    if (str === 'true' || str === '1') return true;
    if (str === 'false' || str === '0') return false;
    return undefined;
  })
  isActive?: boolean | string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const str = String(value).trim().toLowerCase();
    if (str === 'false' || str === '0') return false;
    if (str === 'true' || str === '1') return true;
    return undefined;
  })
  includeAartis?: boolean | string;

  @IsOptional()
  @IsEnum(TEMPLE_VERIFICATION_STATUS, {
    message: 'verificationStatus must be PENDING, APPROVED, or REJECTED',
  })
  verificationStatus?: TEMPLE_VERIFICATION_STATUS;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'submittedByUserId must be an integer' })
  @Min(1, { message: 'submittedByUserId must be at least 1' })
  @Max(2147483647, { message: 'submittedByUserId cannot exceed 2147483647' })
  submittedByUserId?: number;
}
