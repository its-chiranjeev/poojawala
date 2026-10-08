import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, isString, IsString, Max, Min } from 'class-validator';

export class GetTemplesQueryDto {
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
}
