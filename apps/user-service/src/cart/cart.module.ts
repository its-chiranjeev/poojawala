import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Booking,
  BookingProduct,
  Cart,
  CartItem,
  Payment,
  PaymentBooking,
  Product,
} from '@poojawala/entities';
import {
  BookingProductRepository,
  BookingRepository,
  CartItemRepository,
  CartRepository,
  PaymentRepository,
  ProductRepository,
} from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { CommonModule } from '@poojawala/common';
import { NotificationModule } from '@poojawala/notification';
import { GatewayModule } from '@poojawala/gateway';
import { EmailServicesModule } from '@poojawala/email-services';
import { PaymentService } from '../../../payment-service/src/payment/payment.service';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cart,
      CartItem,
      Product,
      Booking,
      BookingProduct,
      Payment,
      PaymentBooking,
    ]),
    CommonModule,
    S3Module,
    NotificationModule,
    GatewayModule,
    EmailServicesModule,
  ],
  controllers: [CartController],
  providers: [
    CartService,
    PaymentService,
    CartRepository,
    CartItemRepository,
    ProductRepository,
    BookingRepository,
    BookingProductRepository,
    PaymentRepository,
  ],
  exports: [
    CartService,
    CartRepository,
    CartItemRepository,
    BookingProductRepository,
  ],
})
export class CartModule {}
