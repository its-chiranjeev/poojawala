import { IsEmail,IsDateString, IsOptional, IsString, IsEnum } from 'class-validator';
import { USER_ROLE, USER_STATUS, BANK_ACCOUNT_TYPE, QUALIFICATION } from '@likemyproduct/entities';
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
  dob?: string;

  @IsOptional()
  @IsString()
  birthPlace?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsEnum(QUALIFICATION)
  qualification?: QUALIFICATION;

  @IsOptional()
  experienceYears?: number;

  @IsOptional()
  @IsString()
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  languages?: string[];

  @IsOptional()
  specializations?: string[];

  @IsOptional()
  isOnlineAvailable?: string;

  @IsOptional()
  isOfflineAvailable?: string;

  @IsOptional()
  @IsString()
  aadhaarDoc?: string;

  @IsOptional()
  @IsString()
  panDoc?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsString()
  templeAffiliationProof?: string;

  // Bank Details

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  ifscCode?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsEnum(BANK_ACCOUNT_TYPE)
  accountType?: BANK_ACCOUNT_TYPE;
}

export class UpdateUserStatusDto {
  @IsEnum(USER_STATUS)
  status!: USER_STATUS;
}
