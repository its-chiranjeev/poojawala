import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, IsDateString, IsArray, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { parseStringArray, parseIntArray } from './register-user.dto';

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

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    username?: string;

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    password!: string;

    @IsOptional()
    @IsDateString()
    dob?: string;

    @IsOptional()
    @Transform(({ value }) => parseIntArray(value))
    @IsArray()
    @IsInt({ each: true })
    services?: number[];

    @IsOptional()
    @Transform(({ value }) => parseStringArray(value))
    @IsArray()
    @IsString({ each: true })
    serviceAreas?: string[];
}
