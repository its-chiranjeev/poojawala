import { IsDateString, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContactUsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'serviceId must be an integer' })
  @Min(1, { message: 'serviceId must be at least 1' })
  @Max(2147483647, { message: 'serviceId cannot exceed 2147483647' })
  serviceId?: number;

  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(150, { message: 'Name cannot exceed 150 characters' })
  name!: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(150, { message: 'Email cannot exceed 150 characters' })
  email!: string;

  @IsNotEmpty({ message: 'Subject is required' })
  @IsString({ message: 'Subject must be a string' })
  @MaxLength(255, { message: 'Subject cannot exceed 255 characters' })
  subject!: string;

  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a string' })
  message!: string;

  @IsOptional()
  @IsDateString({}, { message: 'preferredDateTime must be a valid ISO date string' })
  preferredDateTime?: string;

  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  @MaxLength(1000, { message: 'Address cannot exceed 1000 characters' })
  address?: string;
}
