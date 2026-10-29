import { IsEnum, IsOptional, IsString, IsBoolean, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BANK_ACCOUNT_TYPE, PUROHIT_PAYMENT_METHOD } from '@poojawala/entities';

export class UpdateBankAccountDto {
  @IsOptional()
  @IsEnum(PUROHIT_PAYMENT_METHOD, {
    message: `paymentMethod must be one of: ${Object.values(PUROHIT_PAYMENT_METHOD).join(', ')}`,
  })
  paymentMethod?: PUROHIT_PAYMENT_METHOD;

  @IsOptional()
  @IsString({ message: 'accountHolderName must be a string' })
  @MaxLength(150, { message: 'accountHolderName cannot exceed 150 characters' })
  accountHolderName?: string;

  @IsOptional()
  @IsString({ message: 'accountNumber must be a string' })
  @MaxLength(50, { message: 'accountNumber cannot exceed 50 characters' })
  accountNumber?: string;

  @IsOptional()
  @IsString({ message: 'ifscCode must be a string' })
  @MaxLength(20, { message: 'ifscCode cannot exceed 20 characters' })
  ifscCode?: string;

  @IsOptional()
  @IsString({ message: 'bankName must be a string' })
  @MaxLength(100, { message: 'bankName cannot exceed 100 characters' })
  bankName?: string;

  @IsOptional()
  @IsEnum(BANK_ACCOUNT_TYPE, {
    message: `accountType must be one of: ${Object.values(BANK_ACCOUNT_TYPE).join(', ')}`,
  })
  accountType?: BANK_ACCOUNT_TYPE;

  @IsOptional()
  @IsString({ message: 'upiId must be a string' })
  @MaxLength(100, { message: 'upiId cannot exceed 100 characters' })
  upiId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'isPrimary must be a boolean' })
  isPrimary?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'userId must be an integer' })
  @Min(1, { message: 'userId must be at least 1' })
  @Max(2147483647, { message: 'userId cannot exceed 2147483647' })
  userId?: number;
}
