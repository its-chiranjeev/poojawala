import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Temple, Service, ServiceFeature, TempleAarti, TEMPLE_VERIFICATION_STATUS, User, USER_ROLE } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetTemplesQueryDto } from '@poojawala/dtos';

@Injectable()
export class TempleRepository extends BaseRepository<Temple> {
  constructor(
    @InjectRepository(Temple)
    repo: Repository<Temple>,
  ) {
    super(repo);
  }

  get manager() {
    return this.repo.manager;
  }

  async findAllTemples(query: GetTemplesQueryDto, userOrIsAdmin: User | boolean = false) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { search, city, state } = query;

    const qb = this.repo.createQueryBuilder('temple');
    qb.where('temple.deletedAt IS NULL');

    const isAdmin =
      typeof userOrIsAdmin === 'boolean'
        ? userOrIsAdmin
        : userOrIsAdmin?.role === USER_ROLE.ADMIN;

    const user = typeof userOrIsAdmin === 'object' ? userOrIsAdmin : undefined;
    const isPurohit = user?.role === USER_ROLE.PUROHIT;

    let parsedIsActive: boolean | undefined = undefined;
    if (
      query.isActive !== undefined &&
      query.isActive !== null &&
      (query.isActive as unknown) !== ''
    ) {
      if (typeof query.isActive === 'boolean') {
        parsedIsActive = query.isActive;
      } else {
        const str = String(query.isActive).trim().toLowerCase();
        if (str === 'true' || str === '1') parsedIsActive = true;
        if (str === 'false' || str === '0') parsedIsActive = false;
      }
    }

    // TODO: Replaced legacy visibility filter with role-based temple visibility:
    // - Admin: sees all non-deleted temples regardless of status (respects explicit query filters).
    // - Purohit: sees only non-deleted temples submitted by their own account (submittedByUserId = user.id) regardless of active/verification status.
    // - Public / Customer / Other roles: sees only active, approved, non-deleted temples.
    /*
    if (parsedIsActive !== undefined) {
      qb.andWhere('temple.isActive = :isActive', { isActive: parsedIsActive });
    } else if (!isAdmin) {
      qb.andWhere('temple.isActive = :isActive', { isActive: true });
    }

    if (!isAdmin) {
      qb.andWhere(
        '(temple.verificationStatus = :approvedStatus OR temple.verificationStatus IS NULL)',
        { approvedStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
      );
    } else {
      if (query.verificationStatus) {
        qb.andWhere('temple.verificationStatus = :vStatus', {
          vStatus: query.verificationStatus,
        });
      }
      if (query.submittedByUserId) {
        qb.andWhere('temple.submittedByUserId = :subUserId', {
          subUserId: query.submittedByUserId,
        });
      }
    }
    */
    if (isAdmin) {
      if (parsedIsActive !== undefined) {
        qb.andWhere('temple.isActive = :isActive', { isActive: parsedIsActive });
      }
      if (query.verificationStatus) {
        qb.andWhere('temple.verificationStatus = :vStatus', {
          vStatus: query.verificationStatus,
        });
      }
      if (query.submittedByUserId) {
        qb.andWhere('temple.submittedByUserId = :subUserId', {
          subUserId: query.submittedByUserId,
        });
      }
    } else if (isPurohit) {
      qb.andWhere('temple.submittedByUserId = :purohitUserId', {
        purohitUserId: user!.id,
      });
      if (parsedIsActive !== undefined) {
        qb.andWhere('temple.isActive = :isActive', { isActive: parsedIsActive });
      }
      if (query.verificationStatus) {
        qb.andWhere('temple.verificationStatus = :vStatus', {
          vStatus: query.verificationStatus,
        });
      }
    } else {
      qb.andWhere('temple.isActive = :isActive', { isActive: true });
      qb.andWhere(
        '(temple.verificationStatus = :approvedStatus OR temple.verificationStatus IS NULL)',
        { approvedStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
      );
    }

    if (search && search.trim()) {
      qb.andWhere(
        '(CAST(temple.id AS TEXT) ILIKE :search OR temple.name ILIKE :search OR temple.city ILIKE :search OR temple.state ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    if (city && city.trim()) {
      qb.andWhere('temple.city ILIKE :city', { city: `%${city.trim()}%` });
    }

    if (state && state.trim()) {
      qb.andWhere('temple.state ILIKE :state', { state: `%${state.trim()}%` });
    }

    let isIncludeAartisTrue = false;
    if (
      query.includeAartis !== undefined &&
      query.includeAartis !== null &&
      (query.includeAartis as unknown) !== ''
    ) {
      if (typeof query.includeAartis === 'boolean') {
        isIncludeAartisTrue = query.includeAartis;
      } else {
        const str = String(query.includeAartis).trim().toLowerCase();
        if (str === 'true' || str === '1') isIncludeAartisTrue = true;
      }
    }
    if (isIncludeAartisTrue) {
      qb.andWhere((subQb) => {
        const subQuery = subQb
          .subQuery()
          .select('1')
          .from(TempleAarti, 'aarti')
          .where('aarti.templeId = temple.id')
          .andWhere('aarti.deletedAt IS NULL');

        // TODO: Retained isActive check for public, allowing admin and purohit to include all non-deleted aartis
        /*
        if (!isAdmin) {
          subQuery.andWhere('aarti.isActive = true');
        }
        */
        if (!isAdmin && !isPurohit) {
          subQuery.andWhere('aarti.isActive = true');
        }

        return `EXISTS (${subQuery.getQuery()})`;
      });
    }

    qb.orderBy('temple.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [temples, total] = await qb.getManyAndCount();

    return {
      data: temples,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findTempleById(id: number, userOrIsAdmin: User | boolean = false): Promise<Temple | null> {
    const qb = this.repo.createQueryBuilder('temple');
    qb.where('temple.id = :id', { id });
    qb.andWhere('temple.deletedAt IS NULL');

    const isAdmin =
      typeof userOrIsAdmin === 'boolean'
        ? userOrIsAdmin
        : userOrIsAdmin?.role === USER_ROLE.ADMIN;

    const user = typeof userOrIsAdmin === 'object' ? userOrIsAdmin : undefined;
    const isPurohit = user?.role === USER_ROLE.PUROHIT;

    // TODO: Replaced legacy findTempleById visibility logic.
    // - Admin: any non-deleted temple.
    // - Purohit: ONLY their own submitted temple (submittedByUserId matches auth user id).
    // - Public / Customer / Other roles: ONLY active, approved, non-deleted temple.
    /*
    if (!isAdmin) {
      if (user?.role === USER_ROLE.PUROHIT) {
        qb.andWhere(
          '((temple.isActive = true AND (temple.verificationStatus = :approvedStatus OR temple.verificationStatus IS NULL)) OR temple.submittedByUserId = :purohitUserId)',
          {
            approvedStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
            purohitUserId: user.id,
          },
        );
      } else {
        qb.andWhere('temple.isActive = :isActive', { isActive: true });
        qb.andWhere(
          '(temple.verificationStatus = :approvedStatus OR temple.verificationStatus IS NULL)',
          { approvedStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
        );
      }
    }
    */
    if (isAdmin) {
      // Admin sees any non-deleted temple
    } else if (isPurohit) {
      // Purohit sees ONLY their own submitted temple
      qb.andWhere('temple.submittedByUserId = :purohitUserId', {
        purohitUserId: user!.id,
      });
    } else {
      // Public / Customer / Other roles see only active, approved, non-deleted temple
      qb.andWhere('temple.isActive = :isActive', { isActive: true });
      qb.andWhere(
        '(temple.verificationStatus = :approvedStatus OR temple.verificationStatus IS NULL)',
        { approvedStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
      );
    }

    return qb.getOne();
  }

  // TODO: Previous findActiveServicesByTempleId with limited fields kept for reference:
  /*
  async findActiveServicesByTempleId(templeId: number): Promise<Service[]> {
    return this.repo.manager
      .createQueryBuilder(Service, 'service')
      .select([
        'service.id',
        'service.name',
        'service.slug',
        'service.description',
        'service.metaTitle',
        'service.metaDescription',
        'service.iconUrl',
        'service.tokenPercentage',
        'service.commissionPercentage',
        'service.isActive',
        'service.plans',
      ])
      .where('service.templeId = :templeId', { templeId })
      .andWhere('service.deletedAt IS NULL')
      .andWhere('service.isActive = :isActive', { isActive: true })
      .orderBy('service.createdAt', 'DESC')
      .getMany();
  }
  */
  async findActiveServicesByTempleId(templeId: number): Promise<Service[]> {
    return this.repo.manager
      .createQueryBuilder(Service, 'service')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.templeId = :templeId', { templeId })
      .andWhere('service.deletedAt IS NULL')
      .andWhere('service.isActive = :isActive', { isActive: true })
      .orderBy('service.sortOrder', 'ASC')
      .addOrderBy('service.createdAt', 'DESC')
      .getMany();
  }

  async findActiveServicesByTempleIds(templeIds: number[]): Promise<Service[]> {
    if (!templeIds || templeIds.length === 0) return [];
    return this.repo.manager
      .createQueryBuilder(Service, 'service')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.templeId IN (:...templeIds)', { templeIds })
      .andWhere('service.deletedAt IS NULL')
      .andWhere('service.isActive = :isActive', { isActive: true })
      .orderBy('service.sortOrder', 'ASC')
      .addOrderBy('service.createdAt', 'DESC')
      .getMany();
  }

  async findFeaturesByServiceIds(serviceIds: number[]): Promise<ServiceFeature[]> {
    if (!serviceIds || serviceIds.length === 0) return [];
    return this.repo.manager
      .createQueryBuilder(ServiceFeature, 'feature')
      .where('feature.serviceId IN (:...serviceIds)', { serviceIds })
      .andWhere('feature.deletedAt IS NULL')
      .andWhere('feature.isActive = :isActive', { isActive: true })
      .orderBy('feature.id', 'ASC')
      .getMany();
  }

  async findAartisByTempleId(templeId: number, isAdminOrPurohit: boolean = false): Promise<TempleAarti[]> {
    const qb = this.repo.manager
      .createQueryBuilder(TempleAarti, 'aarti')
      .where('aarti.templeId = :templeId', { templeId })
      .andWhere('aarti.deletedAt IS NULL');

    if (!isAdminOrPurohit) {
      qb.andWhere('aarti.isActive = :isActive', { isActive: true });
    }

    qb.orderBy('aarti.time', 'ASC')
      .addOrderBy('aarti.id', 'ASC');

    return qb.getMany();
  }

  async findAartisByTempleIds(templeIds: number[], isAdminOrPurohit: boolean = false): Promise<TempleAarti[]> {
    if (!templeIds || templeIds.length === 0) return [];
    const qb = this.repo.manager
      .createQueryBuilder(TempleAarti, 'aarti')
      .where('aarti.templeId IN (:...templeIds)', { templeIds })
      .andWhere('aarti.deletedAt IS NULL');

    if (!isAdminOrPurohit) {
      qb.andWhere('aarti.isActive = :isActive', { isActive: true });
    }

    qb.orderBy('aarti.time', 'ASC')
      .addOrderBy('aarti.id', 'ASC');

    return qb.getMany();
  }
}
