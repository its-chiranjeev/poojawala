import { IsEnum, IsOptional, IsString, IsBoolean, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { BANK_ACCOUNT_TYPE, PUROHIT_PAYMENT_METHOD } from '@poojawala/entities';

export class CreatePurohitBankAccountDto {
  @IsEnum(PUROHIT_PAYMENT_METHOD)
  @IsNotEmpty()
  paymentMethod!: PUROHIT_PAYMENT_METHOD;

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

  @IsOptional()
  @IsString()
  upiId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isPrimary?: boolean;
}
