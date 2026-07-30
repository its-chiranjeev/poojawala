import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class ReviewRepository extends BaseRepository<Review> {
  constructor(
    @InjectRepository(Review)
    repo: Repository<Review>,
  ) {
    super(repo);
  }

  findByBookingId(bookingId: number) {
    return this.findOne({
      where: {
        bookingId,
      },
    });
  }

  async getPurohitOverallRating(purohitId: number): Promise<{
    averageRating: number;
    totalReviews: number;
  }> {
    const result = await this.repo
      .createQueryBuilder('review')
      .select('ROUND(AVG(review.rating), 1)', 'averageRating')
      .addSelect('COUNT(review.id)', 'totalReviews')
      .where('review.purohitId = :purohitId', { purohitId })
      .andWhere('review.isVisible = true')
      .getRawOne<{
        averageRating: string | null;
        totalReviews: string;
      }>();

    return {
      averageRating: Number(result?.averageRating ?? 0),
      totalReviews: Number(result?.totalReviews ?? 0),
    };
  }
}
