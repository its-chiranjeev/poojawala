import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, PurohitProfile, Review, User } from '@likemyproduct/entities';
import {
  BookingRepository,
  ReviewRepository,
} from '@likemyproduct/repositories';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Booking, PurohitProfile, User])],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewRepository, BookingRepository],
})
export class ReviewModule {}
