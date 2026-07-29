import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurohitServiceAreaDto {
  @IsString()
  @Length(2, 50)
  addressLabel!: string;

  @IsString()
  @Length(2, 150)
  streetName!: string;

  @IsString()
  fullAddress!: string;

  @IsString()
  @Length(2, 100)
  city!: string;

  @IsString()
  @Length(6, 10)
  pincode!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
