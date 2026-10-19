import { Type, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { REVIEW_STATUS, BOOKING_TYPE } from '@poojawala/entities';

export class ReviewQueryDto {
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
  @IsEnum(REVIEW_STATUS)
  status?: REVIEW_STATUS;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean);
      }
      return trimmed.toUpperCase();
    }
    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
        .filter(Boolean);
    }
    return value;
  })
  @IsEnum(BOOKING_TYPE, {
    each: true,
    message: 'Booking type must be a valid booking type (POOJA or ASTROLOGY)',
  })
  bookingType?: BOOKING_TYPE | BOOKING_TYPE[];
}   