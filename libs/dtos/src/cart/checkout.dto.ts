import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ORDER_PAYMENT_METHOD } from '@poojawala/entities';

export class ShippingAddressDto {
  @IsNotEmpty({ message: 'Recipient name is required' })
  @IsString()
  name!: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  phone!: string;

  @IsNotEmpty({ message: 'Address line 1 is required' })
  @IsString()
  addressLine1!: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsNotEmpty({ message: 'City is required' })
  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsNotEmpty({ message: 'Pincode is required' })
  @IsString()
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
  orderId?: number;
}
