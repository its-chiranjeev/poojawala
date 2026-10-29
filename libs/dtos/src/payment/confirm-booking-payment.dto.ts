import { IsInt, IsNotEmpty, IsString, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmBookingPaymentDto {
  @Type(() => Number)
  @IsInt({ message: 'paymentId must be an integer' })
  @Min(1, { message: 'paymentId must be at least 1' })
  @Max(2147483647, { message: 'paymentId cannot exceed 2147483647' })
  paymentId!: number;

  @IsString({ message: 'razorpayOrderId must be a string' })
  @IsNotEmpty({ message: 'razorpayOrderId is required' })
  @MaxLength(100, { message: 'razorpayOrderId cannot exceed 100 characters' })
  razorpayOrderId!: string;

  @IsString({ message: 'razorpayPaymentId must be a string' })
  @IsNotEmpty({ message: 'razorpayPaymentId is required' })
  @MaxLength(100, { message: 'razorpayPaymentId cannot exceed 100 characters' })
  razorpayPaymentId!: string;

  @IsString({ message: 'razorpaySignature must be a string' })
  @IsNotEmpty({ message: 'razorpaySignature is required' })
  @MaxLength(255, { message: 'razorpaySignature cannot exceed 255 characters' })
  razorpaySignature!: string;
}
