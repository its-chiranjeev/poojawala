import { IsInt, IsNotEmpty, IsString, Min, } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmBookingPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentId!: number;

  @IsString()
  @IsNotEmpty()
  razorpayOrderId!: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId!: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature!: string;
}