import { Type } from 'class-transformer';
import {IsEnum, IsInt, IsOptional, Max, Min, } from 'class-validator';
import { BOOKING_STATUS } from '@likemyproduct/entities';

export class BookingQueryDto {
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
  @IsEnum(BOOKING_STATUS)
  status?: BOOKING_STATUS;
}