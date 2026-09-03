import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_PAYMENT_METHOD } from '@poojawala/entities';

export class CreatePaymentLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bookingId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
    require_tld: false,
  })
  callbackUrl?: string;

  @IsOptional()
  @IsEnum(CUSTOMER_PAYMENT_METHOD)
  customerPaymentMethod?: CUSTOMER_PAYMENT_METHOD;
}
