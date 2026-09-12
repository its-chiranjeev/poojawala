import { CreateReviewDto } from '@poojawala/dtos/review/create-review.dto';
import { ReviewQueryDto } from '@poojawala/dtos/review/review-query.dto';
import { UpdateReviewStatusDto } from '@poojawala/dtos/review/update-review-status.dto';
import {
  BOOKING_STATUS,
  REVIEW_STATUS,
  User,
  USER_ROLE,
} from '@poojawala/entities';
import {
  BookingRepository,
  PurohitProfileRepository,
  UserRepository,
} from '@poojawala/repositories';
import { AUDIT_MODULE, ACTOR_TYPE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReviewJwtPayload } from './review.controller';

@Injectable()
export class ReviewService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly userRepository: UserRepository,
    private readonly purohitProfileRepository: PurohitProfileRepository,
    private readonly auditLogService: AuditLogService,
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
      const purohitProfile = await this.purohitProfileRepository.findOne({
        where: { userId: user.id },
      });
      if (booking.purohitId !== purohitProfile?.id) {
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

    await this.auditLogService.createAuditLog({
      actorId: user.id,
      actorType: ACTOR_TYPE.USER,
      actorRole: user.role,
      module: AUDIT_MODULE.REVIEW,
      entity: 'Review',
      entityId: String(bookingId),
      action: 'REVIEW_CREATED',
      message: `User #${user.id} submitted a review for booking #${bookingId}.`,
      oldValue: undefined,
      newValue: { rating: dto.rating },
    });

    return {
      message: 'Review submitted successfully',
    };
  }

  // TODO: Previous implementation kept for reference.
  // Replaced because:
  // 1. Authenticated ADMIN was incorrectly restricted when status wasn't properly checked.
  // 2. Used duplicate ':status' parameters which caused TypeORM parameter collisions.
  // 3. Authenticated customer and purohit could not see their own draft reviews.
  // 4. Default guest branch and status conditions conflicted.
  /*
  async findAll(user: User | null | undefined, query: ReviewQueryDto) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .leftJoinAndSelect('booking.service', 'service')
      .where(
        '(booking.customerRating IS NOT NULL OR booking.purohitRating IS NOT NULL)',
      );

    if (user?.role === USER_ROLE.CUSTOMER) {
      queryBuilder.andWhere('booking.customerId = :userId', {
        userId: user.id,
      });
    } else if (user?.role === USER_ROLE.PUROHIT) {
      queryBuilder.andWhere('purohit.userId = :userId', { userId: user.id });
    } else if (user?.role === USER_ROLE.ADMIN) {
      // Admin sees all reviews
    } else {
      queryBuilder.andWhere('booking.customerRating IS NOT NULL');
      queryBuilder.andWhere('booking.reviewStatus = :status', {
        status: REVIEW_STATUS.PUBLISHED,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('booking.reviewStatus = :status', {
        status: query.status,
      });
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('booking.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const bookings = await queryBuilder.getMany();

    return {
      data: bookings.map((b) => this.mapReviewResponse(b)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }
  */

  async findAll(
    user: User | ReviewJwtPayload | null | undefined,
    query: ReviewQueryDto,
  ) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .leftJoinAndSelect('booking.service', 'service')
      .where(
        '(booking.customerRating IS NOT NULL OR booking.purohitRating IS NOT NULL)',
      );

    // Normalize user ID (supporting both user.id and user.sub from JWT payload)
    const rawUserId = user?.id ?? (user as ReviewJwtPayload)?.sub;
    const userId: number | null =
      rawUserId !== undefined && rawUserId !== null ? Number(rawUserId) : null;

    const userRole: string | null = user?.role
      ? String(user.role).toUpperCase()
      : null;

    if (userRole === USER_ROLE.ADMIN) {
      // 1. ADMIN:
      // By default returns ALL reviews (PUBLISHED, DRAFT, etc.) where rating is not null.
      // If ?status=... is explicitly passed, filter only by that requested status.
      if (query.status) {
        queryBuilder.andWhere('booking.reviewStatus = :adminReviewStatus', {
          adminReviewStatus: query.status,
        });
      }
    } else if (userRole === USER_ROLE.CUSTOMER) {
      // 2. CUSTOMER:
      // Must only see reviews belonging to that customer (booking.customerId = loggedInCustomer.id).
      // Can see own reviews regardless of review status by default.
      if (userId) {
        queryBuilder.andWhere('booking.customerId = :customerUserId', {
          customerUserId: userId,
        });
      } else {
        queryBuilder.andWhere('booking.customerId = -1');
      }

      // If ?status=... is explicitly provided, filter own reviews by requested status
      if (query.status) {
        queryBuilder.andWhere('booking.reviewStatus = :customerReviewStatus', {
          customerReviewStatus: query.status,
        });
      }
    } else if (userRole === USER_ROLE.PUROHIT) {
      // 3. PUROHIT:
      // Must only see reviews related to that Purohit (purohit.userId = loggedInUser.id).
      // Can see related reviews regardless of review status by default.
      if (userId) {
        queryBuilder.andWhere('purohit.userId = :purohitUserId', {
          purohitUserId: userId,
        });
      } else {
        queryBuilder.andWhere('purohit.userId = -1');
      }

      // If ?status=... is explicitly provided, filter related reviews by requested status
      if (query.status) {
        queryBuilder.andWhere('booking.reviewStatus = :purohitReviewStatus', {
          purohitReviewStatus: query.status,
        });
      }
    } else {
      // 4. GUEST / NOT LOGGED IN:
      // Unauthenticated users must ONLY see customer reviews with reviewStatus = PUBLISHED.
      queryBuilder.andWhere('booking.customerRating IS NOT NULL');
      queryBuilder.andWhere('booking.reviewStatus = :guestPublishedStatus', {
        guestPublishedStatus: REVIEW_STATUS.PUBLISHED,
      });
      // Note: No unnecessary '1 = 0' is used here because booking.reviewStatus = PUBLISHED
      // strictly ensures DRAFT reviews can never be returned, and query.status is never allowed
      // to override this guest security restriction.
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('booking.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const bookings = await queryBuilder.getMany();

    return {
      data: bookings.map((b) => this.mapReviewResponse(b)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async getAllCustomerReviews(query: ReviewQueryDto) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .leftJoinAndSelect('booking.service', 'service')
      .where('booking.customerRating IS NOT NULL')
      .andWhere('booking.reviewStatus = :status', {
        status: REVIEW_STATUS.PUBLISHED,
      });

    const total = await queryBuilder.getCount();

    queryBuilder
      .orderBy('booking.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const bookings = await queryBuilder.getMany();

    return {
      data: bookings.map((b) => this.mapReviewResponse(b)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(user: User, bookingId: number) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .leftJoinAndSelect('booking.service', 'service')
      .where('booking.id = :bookingId', { bookingId })
      .andWhere(
        '(booking.customerRating IS NOT NULL OR booking.purohitRating IS NOT NULL)',
      );

    if (user.role === USER_ROLE.CUSTOMER) {
      queryBuilder.andWhere('booking.customerId = :userId', {
        userId: user.id,
      });
    } else if (user.role === USER_ROLE.PUROHIT) {
      queryBuilder.andWhere('purohit.userId = :userId', { userId: user.id });
    }

    const booking = await queryBuilder.getOne();

    if (!booking) {
      throw new NotFoundException('Review not found for this booking.');
    }

    return this.mapReviewResponse(booking);
  }

  async updateStatus(
    bookingId: number,
    dto: UpdateReviewStatusDto,
    adminId: number,
  ) {
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

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.REVIEW,
      entity: 'Review',
      entityId: String(bookingId),
      action: 'REVIEW_UPDATED',
      message: `Admin updated review status for booking #${bookingId} to ${dto.status}.`,
      oldValue: undefined,
      newValue: { status: dto.status },
    });

    return { message: 'Review status updated successfully' };
  }

  async remove(bookingId: number, adminId: number) {
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

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.REVIEW,
      entity: 'Review',
      entityId: String(bookingId),
      action: 'REVIEW_DELETED',
      message: `Admin deleted review for booking #${bookingId}.`,
      oldValue: undefined,
      newValue: { deleted: true },
    });

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

  private mapReviewResponse(booking: any) {
    return {
      id: booking.id,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,

      customerId: booking.customerId,
      customer: booking.customer
        ? {
            id: booking.customer.id,
            firstName: booking.customer.firstName,
            lastName: booking.customer.lastName,
            profileImage: booking.customer.profileImage,
          }
        : null,

      purohitId: booking.purohitId,
      purohit: booking.purohit
        ? {
            id: booking.purohit.id,
            userId: booking.purohit.userId,
            firstName: booking.purohit.user?.firstName,
            lastName: booking.purohit.user?.lastName,
            profileImage: booking.purohit.user?.profileImage,
            bio: booking.purohit.bio,
            qualification: booking.purohit.qualification,
            experienceYears: booking.purohit.experienceYears,
            languages: booking.purohit.languages,
            specializations: booking.purohit.specializations,
            city: booking.purohit.city,
            avgRating: booking.purohit.avgRating,
          }
        : null,

      serviceId: booking.serviceId,
      service: booking.service
        ? {
            id: booking.service.id,
            name: booking.service.name,
            iconUrl: booking.service.iconUrl,
          }
        : null,

      customerReview: booking.customerReview,
      customerRating: booking.customerRating,
      purohitReview: booking.purohitReview,
      purohitRating: booking.purohitRating,
      reviewStatus: booking.reviewStatus,

      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}
