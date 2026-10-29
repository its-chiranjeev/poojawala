import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ORDER_PAYMENT_METHOD } from '@poojawala/entities';

export class ShippingAddressDto {
  @IsNotEmpty({ message: 'Recipient name is required' })
  @IsString({ message: 'Recipient name must be a string' })
  @MaxLength(100, { message: 'Recipient name cannot exceed 100 characters' })
  name!: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone number must be a string' })
  @MaxLength(20, { message: 'Phone number cannot exceed 20 characters' })
  phone!: string;

  @IsNotEmpty({ message: 'Address line 1 is required' })
  @IsString({ message: 'Address line 1 must be a string' })
  @MaxLength(255, { message: 'Address line 1 cannot exceed 255 characters' })
  addressLine1!: string;

  @IsOptional()
  @IsString({ message: 'Address line 2 must be a string' })
  @MaxLength(255, { message: 'Address line 2 cannot exceed 255 characters' })
  addressLine2?: string;

  @IsNotEmpty({ message: 'City is required' })
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  city!: string;

  @IsOptional()
  @IsString({ message: 'State must be a string' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state?: string;

  @IsNotEmpty({ message: 'Pincode is required' })
  @IsString({ message: 'Pincode must be a string' })
  @MaxLength(20, { message: 'Pincode cannot exceed 20 characters' })
  pincode!: string;
}

export class CheckoutDto {
  @IsOptional()
  @IsEnum(ORDER_PAYMENT_METHOD, {
    message: 'paymentMethod must be ONLINE or COD',
  })
  paymentMethod?: ORDER_PAYMENT_METHOD;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'addressId must be an integer' })
  @Min(1, { message: 'addressId must be at least 1' })
  @Max(2147483647, { message: 'addressId cannot exceed 2147483647' })
  addressId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  /**
   * If retrying payment for an existing unpaid order
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderId must be an integer' })
  @Min(1, { message: 'orderId must be at least 1' })
  @Max(2147483647, { message: 'orderId cannot exceed 2147483647' })
  orderId?: number;
}
