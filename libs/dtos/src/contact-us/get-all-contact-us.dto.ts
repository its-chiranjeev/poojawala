import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsEnum, IsBoolean } from 'class-validator';
import { CONTACT_US_STATUS } from '@poojawala/entities';

export class GetAllContactUsDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : 1))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CONTACT_US_STATUS)
  status?: CONTACT_US_STATUS;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return isNaN(parsed) ? value : parsed;
  })
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  isServiceQuery?: boolean;
}
