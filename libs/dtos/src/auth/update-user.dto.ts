import { IsEmail,IsDateString, IsOptional, IsString, IsEnum } from 'class-validator';
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { Match } from './register-user.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(USER_ROLE)
  role?: USER_ROLE;

  @IsOptional()
  @IsEnum(USER_STATUS)
  status?: USER_STATUS;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @Match('password', { message: 'Passwords do not match' })
  confirmPassword?: string;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @IsString()
  birthPlace?: string;
}

export class UpdateUserStatusDto {
  @IsEnum(USER_STATUS)
  status!: USER_STATUS;
}
