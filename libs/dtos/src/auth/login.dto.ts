import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Email or username must be a string' })
  @IsNotEmpty({ message: 'Email or username is required' })
  @MaxLength(150, { message: 'Email or username cannot exceed 150 characters' })
  @Transform(({ value }) => value?.trim())
  email!: string; // email OR username

  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @Transform(({ value }) => value?.trim())
  password!: string;
}
