import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, Max, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_PAYMENT_METHOD } from '@poojawala/entities';

export class CreatePaymentLinkDto {
  @Type(() => Number)
  @IsInt({ message: 'bookingId must be an integer' })
  @Min(1, { message: 'bookingId must be at least 1' })
  @Max(2147483647, { message: 'bookingId cannot exceed 2147483647' })
  bookingId!: number;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(200, { message: 'description cannot exceed 200 characters' })
  description?: string;

  @IsOptional()
  @IsUrl(
    {
      require_protocol: true,
      require_tld: false,
    },
    {
      message: 'callbackUrl must be a valid URL',
    },
  )
  @MaxLength(500, { message: 'callbackUrl cannot exceed 500 characters' })
  callbackUrl?: string;

  @IsOptional()
  @IsEnum(CUSTOMER_PAYMENT_METHOD, {
    message: `customerPaymentMethod must be one of: ${Object.values(CUSTOMER_PAYMENT_METHOD).join(', ')}`,
  })
  customerPaymentMethod?: CUSTOMER_PAYMENT_METHOD;

  @IsOptional()
  @IsIn(['TOKEN', 'FULL'], {
    message: 'paymentOption must be either TOKEN or FULL',
  })
  paymentOption?: 'TOKEN' | 'FULL';
}
