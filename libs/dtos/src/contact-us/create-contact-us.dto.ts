import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContactUsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceId?: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  subject!: string;

  @IsNotEmpty()
  @IsString()
  message!: string;
}
