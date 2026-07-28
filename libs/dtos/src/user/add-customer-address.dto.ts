import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { VENUE_TYPE } from '@likemyproduct/entities';

export class CreateCustomerAddressDto {
  @IsEnum(VENUE_TYPE)
  venueType!: VENUE_TYPE;

  @IsString()
  @Length(2, 50)
  addressLabel!: string;

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
}
