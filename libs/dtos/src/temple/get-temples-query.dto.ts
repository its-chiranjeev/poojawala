import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TEMPLE_VERIFICATION_STATUS } from '@poojawala/entities';

export class GetTemplesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
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
  @IsEnum(TEMPLE_VERIFICATION_STATUS)
  verificationStatus?: TEMPLE_VERIFICATION_STATUS;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  submittedByUserId?: number;
}
