import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, PurohitProfile, User, AstrologerProfile } from '@poojawala/entities';
import {
  BookingRepository,
  UserRepository,
  PurohitProfileRepository,
  AstrologerProfileRepository,
} from '@poojawala/repositories';
import { CommonModule } from '@poojawala/common';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, PurohitProfile, User, AstrologerProfile]), CommonModule],
  controllers: [ReviewController],
  providers: [
    ReviewService,
    BookingRepository,
    UserRepository,
    PurohitProfileRepository,
    AstrologerProfileRepository,
  ],
})
export class ReviewModule {}