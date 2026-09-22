import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Booking,
  BookingProduct,
  Cart,
  CartItem,
  Payment,
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
    ]),
    CommonModule,
    S3Module,
  ],
  controllers: [CartController],
  providers: [
    CartService,
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
