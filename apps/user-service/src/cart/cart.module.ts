import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Booking,
  BookingProduct,
  Cart,
  CartItem,
  CustomerAddress,
  Order,
  OrderItem,
  Payment,
  PaymentBooking,
  Product,
} from '@poojawala/entities';
import {
  BookingProductRepository,
  BookingRepository,
  CartItemRepository,
  CartRepository,
  CustomerAddressRepository,
  OrderRepository,
  PaymentRepository,
  ProductRepository,
  RepositoriesModule,
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
      Order,
      OrderItem,
      CustomerAddress,
    ]),
    CommonModule,
    S3Module,
    NotificationModule,
    GatewayModule,
    EmailServicesModule,
    RepositoriesModule,
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
    OrderRepository,
    CustomerAddressRepository,
  ],
  exports: [
    CartService,
    CartRepository,
    CartItemRepository,
    BookingProductRepository,
  ],
})
export class CartModule {}
