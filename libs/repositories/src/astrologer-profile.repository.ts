import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AstrologerProfile } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class AstrologerProfileRepository extends BaseRepository<AstrologerProfile> {
  constructor(
    @InjectRepository(AstrologerProfile)
    repo: Repository<AstrologerProfile>,
  ) {
    super(repo);
  }

  async findByUserId(userId: number): Promise<AstrologerProfile | null> {
    return this.repo
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('profile.userId = :userId', { userId })
      .getOne();
  }

  async findAllAstrologers(query: any) {
    const { page = 1, limit = 10, search, city, verificationStatus } = query;
    const qb = this.repo
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user');

    if (city) {
      qb.andWhere('LOWER(profile.city) = LOWER(:city)', { city: city.trim() });
    }

    if (verificationStatus) {
      qb.andWhere('profile.verificationStatus = :verificationStatus', {
        verificationStatus,
      });
    }

    if (search) {
      qb.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR profile.bio ILIKE :search OR profile.city ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    qb.orderBy('profile.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
  }
}
