import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { CONTACT_US_STATUS } from '@poojawala/entities';

export class GetAllContactUsDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : 1))
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : 10))
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit: number = 10;

  @IsOptional()
  @IsString({ message: 'search must be a string' })
  @MaxLength(100, { message: 'search cannot exceed 100 characters' })
  search?: string;

  @IsOptional()
  @IsEnum(CONTACT_US_STATUS, { message: `status must be one of: ${Object.values(CONTACT_US_STATUS).join(', ')}` })
  status?: CONTACT_US_STATUS;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return isNaN(parsed) ? value : parsed;
  })
  @IsInt({ message: 'serviceId must be an integer' })
  @Min(1, { message: 'serviceId must be at least 1' })
  @Max(2147483647, { message: 'serviceId cannot exceed 2147483647' })
  serviceId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isServiceQuery must be a boolean' })
  isServiceQuery?: boolean;
}
