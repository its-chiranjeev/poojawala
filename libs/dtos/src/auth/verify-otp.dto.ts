import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsPhoneNumber,
  ValidateIf
} from 'class-validator';
import { USER_ROLE } from '@likemyproduct/entities';

import { OTP_TYPE } from '@likemyproduct/entities';

export class VerifyOtpDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  otp!: string;
}



export class ResendOtpDto {
  @ValidateIf((o) => !o.phone)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ValidateIf((o) => !o.email)
  @IsPhoneNumber()
  @IsOptional()
  phone?: string;

  @IsEnum(OTP_TYPE)
  otpType?: OTP_TYPE;
}
