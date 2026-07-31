import { CreateReviewDto } from '@likemyproduct/dtos/review/create-review.dto';
import { UpdateReviewDto } from '@likemyproduct/dtos/review/update-review.dto';
import { BOOKING_STATUS } from '@likemyproduct/entities';
import {
  BookingRepository,
  ReviewRepository,
} from '@likemyproduct/repositories';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, USER_ROLE } from '../../../../libs/entities/src/user.entity';

@Injectable()
export class ReviewService {
  constructor(
    private readonly reviewRepository: ReviewRepository,
    private readonly bookingRepository: BookingRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(customerId: number, dto: CreateReviewDto) {
    // Find booking
    const booking = await this.bookingRepository.findOne({
      where: {
        id: dto.bookingId,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    // Booking belongs to logged in customer
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('You cannot review this booking.');
    }

    // Booking must be completed
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(
        'Review can only be added after booking completion.',
      );
    }

    // Booking must have a purohit
    if (!booking.purohitId) {
      throw new BadRequestException('Purohit not assigned for this booking.');
    }

    // Review already exists
    const existingReview = await this.reviewRepository.findOne({
      where: {
        bookingId: dto.bookingId,
      },
    });

    if (existingReview) {
      throw new ConflictException('Review already submitted for this booking.');
    }

    const review = this.reviewRepository.create({
      bookingId: dto.bookingId,
      customerId,
      purohitId: booking.purohitId,
      rating: dto.rating,
      comment: dto.comment,
    });

    return await this.reviewRepository.save(review);
  }

  async update(id: number, customerId: number, dto: UpdateReviewDto) {
    const review = await this.reviewRepository.findOne({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    if (review.customerId !== customerId) {
      throw new ForbiddenException('You cannot update this review.');
    }

    if (dto.rating !== undefined) {
      review.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      review.comment = dto.comment;
    }

    return await this.reviewRepository.save(review);
  }

  async remove(id: number, customerId: number, bookingId: number) {
    const review = await this.reviewRepository.findOne({
      where: {
        id,
        bookingId,
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    if (review.customerId !== customerId) {
      throw new ForbiddenException(
        'You are not allowed to delete this review.',
      );
    }

    await this.reviewRepository.delete(id);

    return {
      message: 'Review deleted successfully.',
    };
  }

  async findByBooking(bookingId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await this.reviewRepository.findAndCount({
      where: {
        bookingId,
      },
      relations: {
        customer: true,
        purohit: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip,
      take: limit,
    });

    return {
      data: reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPurohitOverallRating(purohitId: number) {
    const purohit = await this.userRepository.findOne({
      where: {
        id: purohitId,
      },
    });

    if (!purohit) {
      throw new NotFoundException('Purohit not found.');
    }
    
    if (purohit.role !== USER_ROLE.PUROHIT) {
      throw new BadRequestException('User is not a purohit.');
    }
    const result =
      await this.reviewRepository.getPurohitOverallRating(purohitId);

    return {
      purohitId,
      averageRating: result.averageRating,
      totalReviews: result.totalReviews,
    };
  }
}
