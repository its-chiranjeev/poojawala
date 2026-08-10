import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePurohitByAdminDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  username!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  city?: string;
}
