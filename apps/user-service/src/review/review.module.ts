import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, PurohitProfile, User } from '@poojawala/entities';
import { BookingRepository, UserRepository, PurohitProfileRepository } from '@poojawala/repositories';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, PurohitProfile, User])],
  controllers: [ReviewController],
  providers: [ReviewService, BookingRepository, UserRepository, PurohitProfileRepository],
})
export class ReviewModule {}