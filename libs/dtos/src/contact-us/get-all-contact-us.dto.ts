import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsEnum } from 'class-validator';
import { CONTACT_US_STATUS } from '@poojawala/entities';

export class GetAllContactUsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
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
}
