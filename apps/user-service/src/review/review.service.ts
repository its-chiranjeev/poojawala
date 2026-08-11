import { CreateReviewDto } from '@poojawala/dtos/review/create-review.dto';
import { ReviewQueryDto } from '@poojawala/dtos/review/review-query.dto';
import { UpdateReviewStatusDto } from '@poojawala/dtos/review/update-review-status.dto';
import { BOOKING_STATUS, REVIEW_STATUS, User, USER_ROLE } from '@poojawala/entities';
import {
  BookingRepository,
  PurohitProfileRepository,
  UserRepository,
} from '@poojawala/repositories';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class ReviewService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly userRepository: UserRepository,
    private readonly purohitProfileRepository: PurohitProfileRepository,
  ) {}

  async create(user: User, bookingId: number, dto: CreateReviewDto) {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(
        'Review can only be added after booking completion.',
      );
    }

    if (user.role === USER_ROLE.CUSTOMER) {
      if (booking.customerId !== user.id) {
        throw new ForbiddenException('You cannot review this booking.');
      }
      if (
        booking.customerRating !== null &&
        booking.customerRating !== undefined
      ) {
        throw new BadRequestException(
          'You have already reviewed this booking.',
        );
      }
      booking.customerRating = dto.rating;
      booking.customerReview = dto.review;
    } else if (user.role === USER_ROLE.PUROHIT) {
      if (booking.purohitId !== user.id) {
        throw new ForbiddenException('You cannot review this booking.');
      }
      if (
        booking.purohitRating !== null &&
        booking.purohitRating !== undefined
      ) {
        throw new BadRequestException(
          'You have already reviewed this booking.',
        );
      }
      booking.purohitRating = dto.rating;
      booking.purohitReview = dto.review;
    } else {
      throw new ForbiddenException(
        'Only customers and purohits can submit a review.',
      );
    }

    // A new review sets the reviewStatus to DRAFT
    booking.reviewStatus = REVIEW_STATUS.DRAFT;

    await this.bookingRepository.save(booking);

    return {
      message: 'Review submitted successfully',
    };
  }

  async findAll(user: User, query: ReviewQueryDto) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .where(
        '(booking.customerRating IS NOT NULL OR booking.purohitRating IS NOT NULL)',
      );

    if (user.role === USER_ROLE.CUSTOMER) {
      queryBuilder.andWhere('booking.customerId = :userId', {
        userId: user.id,
      });
    } else if (user.role === USER_ROLE.PUROHIT) {
      queryBuilder.andWhere('booking.purohitId = :userId', { userId: user.id });
    }

    if (query.status) {
      queryBuilder.andWhere('booking.reviewStatus = :status', {
        status: query.status,
      });
    } else if (user.role !== USER_ROLE.ADMIN) {
      // Non-admins can only see PUBLISHED reviews (or their own? but they can see their own anyway if we don't filter.
      // Wait, if they submitted it they should probably see it regardless of status, but requirement says status filter.)
      // Let's not restrict unless requested.
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('booking.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const bookings = await queryBuilder.getMany();

    return {
      data: bookings,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async findOne(user: User, bookingId: number) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .where('booking.id = :bookingId', { bookingId })
      .andWhere(
        '(booking.customerRating IS NOT NULL OR booking.purohitRating IS NOT NULL)',
      );

    if (user.role === USER_ROLE.CUSTOMER) {
      queryBuilder.andWhere('booking.customerId = :userId', {
        userId: user.id,
      });
    } else if (user.role === USER_ROLE.PUROHIT) {
      queryBuilder.andWhere('booking.purohitId = :userId', { userId: user.id });
    }

    const booking = await queryBuilder.getOne();

    if (!booking) {
      throw new NotFoundException('Review not found for this booking.');
    }

    return booking;
  }

  async updateStatus(bookingId: number, dto: UpdateReviewStatusDto) {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (
      !booking ||
      (booking.customerRating === null && booking.purohitRating === null)
    ) {
      throw new NotFoundException('Review not found.');
    }

    booking.reviewStatus = dto.status;
    await this.bookingRepository.save(booking);

    // Recalculate ratings for both parties based on the new status
    if (booking.purohitId) {
      await this.recalculatePurohitRating(booking.purohitId);
    }
    if (booking.customerId) {
      await this.recalculateCustomerRating(booking.customerId);
    }

    return { message: 'Review status updated successfully' };
  }

  async remove(bookingId: number) {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    booking.customerRating = null as any;
    booking.customerReview = null as any;
    booking.purohitRating = null as any;
    booking.purohitReview = null as any;
    booking.reviewStatus = REVIEW_STATUS.DRAFT; // Reset to default

    await this.bookingRepository.save(booking);

    // Recalculate since reviews are removed
    if (booking.purohitId) {
      await this.recalculatePurohitRating(booking.purohitId);
    }
    if (booking.customerId) {
      await this.recalculateCustomerRating(booking.customerId);
    }

    return { message: 'Review deleted successfully.' };
  }

  async getPurohitOverallRating(purohitId: number) {
    const result = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('AVG(booking.customerRating)', 'average')
      .addSelect('COUNT(booking.id)', 'count')
      .where('booking.purohitId = :purohitId', { purohitId })
      .andWhere('booking.customerRating IS NOT NULL')
      .andWhere('booking.reviewStatus = :status', {
        status: REVIEW_STATUS.PUBLISHED,
      })
      .getRawOne();

    return {
      averageRating: parseFloat(result?.average || '0'),
    };
  }

  private async recalculatePurohitRating(purohitId: number) {
    const stats = await this.getPurohitOverallRating(purohitId);

    // Max rating is 5
    const finalRating = Math.min(stats.averageRating, 5.0);

    // PurohitProfile is linked to User id. Find profile first since update requires profile ID.
    const profile = await this.purohitProfileRepository.findOne({
      where: { userId: purohitId },
    });
    if (profile) {
      await this.purohitProfileRepository.update(profile.id, {
        avgRating: finalRating,
      });
    }
  }

  private async recalculateCustomerRating(customerId: number) {
    const result = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('AVG(booking.purohitRating)', 'average')
      .addSelect('COUNT(booking.id)', 'count')
      .where('booking.customerId = :customerId', { customerId })
      .andWhere('booking.purohitRating IS NOT NULL')
      .andWhere('booking.reviewStatus = :status', {
        status: REVIEW_STATUS.PUBLISHED,
      })
      .getRawOne();

    const avg = parseFloat(result?.average || '0');
    const finalRating = Math.min(avg, 5.0);
    const count = parseInt(result?.count || '0', 10);

    await this.userRepository.update(customerId, {
      avgRating: finalRating,
    });
  }
}
