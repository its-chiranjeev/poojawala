import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, } from 'class-validator';
import { Type } from 'class-transformer';

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
  })
  callbackUrl?: string;
}
