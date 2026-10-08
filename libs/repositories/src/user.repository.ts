import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { Brackets } from 'typeorm';
import { USER_ROLE, USER_STATUS } from '@poojawala/entities';
import { Not } from 'typeorm';
import { GetAllUsersDto } from '@poojawala/dtos/user/get-all-users.dto';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repo: Repository<User>,
  ) {
    super(repo);
  }

  // Only user-specific queries here
  async findByEmail(email: string) {
    if (!email) return null;
    return this.repo.findOne({
      where: { email: ILike(email.trim()) },
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.repo.findOne({
      where: { googleId },
    });
  }

  async findByEmailOrUsername(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    return this.repo.findOne({
      where: [{ email: normalized }],
    });
  }

  async updateUser(id: string | number, payload: Partial<User>) {
    await this.repo.update(id, payload as any);

    return this.repo.findOne({
      where: { id } as any,
    });
  }

  async softDeleteUser(id: string | number) {
    return this.repo.softDelete(id);
  }

  async getAllUsers(query: GetAllUsersDto) {
    const { page, limit, search, role, status, sortBy, order } = query;

    const qb = this.repo.createQueryBuilder('user');
    qb.leftJoinAndMapOne('user.profile', 'purohit_profiles', 'profile', 'profile.userId = user.id');
    qb.leftJoinAndMapMany('user.bankAccounts', 'purohit_bank_accounts', 'bankAccounts', 'bankAccounts.purohitId = profile.id');
    qb.leftJoinAndSelect('user.serviceAreas', 'serviceAreas', 'serviceAreas.deletedAt IS NULL');
    qb.leftJoinAndSelect('user.addresses', 'addresses', 'addresses.deletedAt IS NULL');
    qb.leftJoinAndMapMany('user.purohitServices', 'purohit_services', 'purohitServices', 'purohitServices.purohitId = profile.id AND purohitServices.deletedAt IS NULL');
    qb.leftJoinAndMapOne('purohitServices.service', 'services', 'service', 'service.id = purohitServices.serviceId');
    if (search) {
      qb.andWhere(
        new Brackets((qb) => {
          qb.where('CAST("user"."id" AS TEXT) LIKE :search', {
            search: `%${search}%`,
          })
            .orWhere('LOWER(user.email) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(user.firstName) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(user.lastName) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('user.phone LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    if (role) {
      qb.andWhere('user.role = :role', { role });
    }

    if (status) {
      qb.andWhere('user.status = :status', { status });
    }

    if (query.verificationStatus && role === 'PUROHIT') {
      qb.andWhere('profile.verificationStatus = :verificationStatus', {
        verificationStatus: query.verificationStatus,
      });
    }

    if (query.isOfflineAvailable !== undefined && role === 'PUROHIT') {
      qb.andWhere('profile.isOfflineAvailable = :isOfflineAvailable', {
        isOfflineAvailable: query.isOfflineAvailable,
      });
    }

    if (query.isOnlineAvailable !== undefined && role === 'PUROHIT') {
      qb.andWhere('profile.isOnlineAvailable = :isOnlineAvailable', {
        isOnlineAvailable: query.isOnlineAvailable,
      });
    }

    if (query.city) {
      qb.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(serviceAreas.city) LIKE LOWER(:city) AND serviceAreas.isDefault = true', { city: `%${query.city}%` })
            .orWhere('LOWER(addresses.city) LIKE LOWER(:city)', { city: `%${query.city}%` });
        })
      );
    }

    if (query.serviceId) {
      qb.andWhere('service.id = :serviceId', { serviceId: query.serviceId });
    }

    qb.orderBy(`user.${sortBy}`, order);

    qb.skip((page - 1) * limit);

    qb.take(limit);

    const [users, total] = await qb.getManyAndCount();

    for (const u of users) {
      if (u.role === USER_ROLE.PUROHIT) {
        this.enrichPurohitServicesPayout(u);
      }
    }

    return {
      users,
      total,
    };
  }

  async findById(id: string | number) {
    return this.repo.findOne({ where: { id } as any });
  }
  async findApprovedPurohits(
    page = 1,
    limit = 10,
    search?: string,
    status?: USER_STATUS | string,
    isActive?: string | boolean,
    isOnlineAvailable?: string | boolean,
    isOfflineAvailable?: string | boolean,
  ) {
    const query = this.repo
      .createQueryBuilder('user')
      .leftJoinAndMapOne('user.profile', 'purohit_profiles', 'profile', 'profile.userId = user.id')
      .leftJoinAndMapMany('user.purohitServices', 'purohit_services', 'purohitServices', 'purohitServices.purohitId = profile.id')
      .leftJoinAndMapOne('purohitServices.service', 'services', 'service', 'service.id = purohitServices.serviceId')
      .where('user.role = :role', { role: USER_ROLE.PUROHIT });

    // Status / isActive filter
    if (status) {
      if (typeof status === 'string' && status.toUpperCase() === 'ALL') {
        // do not restrict status
      } else {
        query.andWhere('user.status = :status', { status });
      }
    } else if (isActive !== undefined && isActive !== null && isActive !== '') {
      const activeFlag = isActive === true || isActive === 'true';
      if (activeFlag) {
        query.andWhere('user.status = :status', { status: USER_STATUS.ACTIVE });
      } else {
        query.andWhere('user.status != :status', { status: USER_STATUS.ACTIVE });
      }
    } else {
      // Default behavior: active purohits
      query.andWhere('user.status = :status', { status: USER_STATUS.ACTIVE });
    }

    // Availability filters
    if (isOnlineAvailable !== undefined && isOnlineAvailable !== null && isOnlineAvailable !== '') {
      const onlineFlag = isOnlineAvailable === true || isOnlineAvailable === 'true';
      query.andWhere('profile.isOnlineAvailable = :isOnlineAvailable', { isOnlineAvailable: onlineFlag });
    }

    if (isOfflineAvailable !== undefined && isOfflineAvailable !== null && isOfflineAvailable !== '') {
      const offlineFlag = isOfflineAvailable === true || isOfflineAvailable === 'true';
      query.andWhere('profile.isOfflineAvailable = :isOfflineAvailable', { isOfflineAvailable: offlineFlag });
    }

    if (search) {
      query.andWhere(
        `(
          CAST("user"."id" AS TEXT) LIKE :search
          OR LOWER(user.firstName) LIKE LOWER(:search)
          OR LOWER(user.lastName) LIKE LOWER(:search)
          OR LOWER(CONCAT(user.firstName, ' ', user.lastName)) LIKE LOWER(:search)
          OR LOWER(user.email) LIKE LOWER(:search)
        )`,
        {
          search: `%${search}%`,
        },
      );
    }

    query.orderBy('user.id', 'DESC').skip((page - 1) * limit).take(limit);

    const [users, total] = await query.getManyAndCount();

    const data = users.map((user: any) => ({
      id: user.id,
      profileImage: user.profileImage,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      role: user.role,
      status: user.status,
      profile: user.profile,
      services: user.purohitServices || [],
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findApprovedPurohitById(id: number) {
    return this.repo.findOne({
      where: {
        id,
        role: USER_ROLE.PUROHIT,
        status: USER_STATUS.ACTIVE,
      },
    });
  }

  async getFullProfile(userId: number, role: USER_ROLE) {
    const qb = this.repo
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId });

    if (role === USER_ROLE.PUROHIT) {
      qb.leftJoinAndMapOne(
        'user.profile',
        'purohit_profiles',
        'profile',
        'profile.userId = user.id',
      )
        .leftJoinAndMapMany('user.bankAccounts', 'purohit_bank_accounts', 'bankAccounts', 'bankAccounts.purohitId = profile.id')
        .leftJoinAndSelect('user.serviceAreas', 'serviceAreas', 'serviceAreas.deletedAt IS NULL')
        .leftJoinAndSelect('user.addresses', 'addresses', 'addresses.deletedAt IS NULL')
        .leftJoinAndMapMany('user.purohitServices', 'purohit_services', 'purohitServices', 'purohitServices.purohitId = profile.id AND purohitServices.deletedAt IS NULL').leftJoinAndMapOne('purohitServices.service', 'services', 'service', 'service.id = purohitServices.serviceId')
        .addOrderBy('serviceAreas.isDefault', 'DESC')
        .addOrderBy('serviceAreas.createdAt', 'DESC');
    } else {
      qb.leftJoinAndSelect('user.addresses', 'addresses', 'addresses.deletedAt IS NULL');
    }

    const user = await qb.getOne();
    if (user && role === USER_ROLE.PUROHIT) {
      this.enrichPurohitServicesPayout(user);
    }
    return user;
  }

  public enrichPurohitServicesPayout(user: any): void {
    if (!user) return;
    const purohitServices = user.purohitServices;
    if (Array.isArray(purohitServices)) {
      for (const ps of purohitServices) {
        const service = ps.service;
        if (service) {
          let plans = service.plans;
          if (typeof plans === 'string') {
            try {
              plans = JSON.parse(plans);
            } catch { }
          }


          const commissionPercentage = Number(
            service.commissionPercentage != null
              ? service.commissionPercentage
              : 10,
          );

          const effectiveToken =
            service.tokenPercentage != null && Number(service.tokenPercentage) > 0
              ? Number(service.tokenPercentage)
              : 30;

          if (plans && typeof plans === 'object') {
            for (const [key, plan] of Object.entries(plans)) {
              if (plan && (plan as any).price != null && Number((plan as any).price) > 0) {
                const planPrice = Number((plan as any).price);
                const tAmt = Number(((planPrice * effectiveToken) / 100).toFixed(2));
                (plan as any).tokenAmount = tAmt;

                const platformCommission = Number(
                  ((planPrice * commissionPercentage) / 100).toFixed(2),
                );
                const planPayout = Number((planPrice - platformCommission).toFixed(2));
                (plan as any).purohitPayoutAmount = planPayout;
                (plan as any)[`${key}PurohitPayoutAmount`] = planPayout;

                if (key === 'basic') {
                  service.basicPurohitPayoutAmount = planPayout;
                } else if (key === 'standard') {
                  service.standardPurohitPayoutAmount = planPayout;
                }
              }
            }
            service.plans = plans;
          }
        }
      }
    }
    if (user.profile && !user.profile.purohitServices && user.purohitServices) {
      user.profile.purohitServices = user.purohitServices;
    }
  }
}
