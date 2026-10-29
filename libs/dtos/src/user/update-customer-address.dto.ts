import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VENUE_TYPE } from '@poojawala/entities';
import { Type } from 'class-transformer';

export class UpdateCustomerAddressDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Address ID must be an integer' })
  @Min(1, { message: 'Address ID must be at least 1' })
  @Max(2147483647, { message: 'Address ID cannot exceed 2147483647' })
  id?: number;

  @IsOptional()
  @IsEnum(VENUE_TYPE, {
    message: `venueType must be one of: ${Object.values(VENUE_TYPE).join(', ')}`,
  })
  venueType?: VENUE_TYPE;

  @IsOptional()
  @IsString({ message: 'addressLabel must be a string' })
  @Length(2, 50, { message: 'addressLabel must be between 2 and 50 characters' })
  addressLabel?: string;

  @IsOptional()
  @IsString({ message: 'fullAddress must be a string' })
  @MaxLength(500, { message: 'fullAddress cannot exceed 500 characters' })
  fullAddress?: string;

  @IsOptional()
  @IsString({ message: 'city must be a string' })
  @Length(2, 100, { message: 'city must be between 2 and 100 characters' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'state must be a string' })
  @Length(2, 100, { message: 'state must be between 2 and 100 characters' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'pincode must be a string' })
  @Length(6, 10, { message: 'pincode must be between 6 and 10 characters' })
  pincode?: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'latitude must be a valid number' })
  @Min(-90, { message: 'latitude must be at least -90' })
  @Max(90, { message: 'latitude cannot exceed 90' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'longitude must be a valid number' })
  @Min(-180, { message: 'longitude must be at least -180' })
  @Max(180, { message: 'longitude cannot exceed 180' })
  longitude?: number;
}
