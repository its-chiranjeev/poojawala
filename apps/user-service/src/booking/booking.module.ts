import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, CustomerAddress, Service } from '@likemyproduct/entities';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingRepository } from '@likemyproduct/repositories';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Service,
      CustomerAddress,
    ]),
  ],
  controllers: [BookingController],
  providers: [BookingService, BookingRepository],
  exports: [
    BookingService,
    BookingRepository,
  ],
})
export class BookingModule {}