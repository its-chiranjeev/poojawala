import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    return this.repo.findOne({
      where: { email },
    });
  }

  async findByEmailOrUsername(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    return this.repo.findOne({
      where: [{ email: normalized }],
    });
  }

  async updateUser(id: string | number, payload: Partial<User>) {
    await this.repo.update(id, payload);

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
    qb.leftJoinAndSelect('user.serviceAreas', 'serviceAreas');
    qb.leftJoinAndSelect('user.addresses', 'addresses');
    qb.leftJoinAndMapMany('user.purohitServices', 'purohit_services', 'purohitServices', 'purohitServices.purohitId = profile.id');
    qb.leftJoinAndMapOne('purohitServices.service', 'services', 'service', 'service.id = purohitServices.serviceId');
    if (search) {
      qb.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.username) LIKE LOWER(:search)', {
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

    return {
      users,
      total,
    };
  }

  async findById(id: string | number) {
    return this.repo.findOne({ where: { id } as any });
  }
  async findApprovedPurohits(page = 1, limit = 10, search?: string) {
    const query = this.repo
      .createQueryBuilder('user')
      .leftJoinAndMapOne('user.profile', 'purohit_profiles', 'profile', 'profile.userId = user.id')
      .leftJoinAndMapMany('user.purohitServices', 'purohit_services', 'purohitServices', 'purohitServices.purohitId = profile.id')
      .leftJoinAndMapOne('purohitServices.service', 'services', 'service', 'service.id = purohitServices.serviceId')
      .where('user.role = :role', { role: USER_ROLE.PUROHIT })
      .andWhere('user.status = :status', { status: USER_STATUS.ACTIVE });

    if (search) {
      const isNumber = !isNaN(Number(search));

      if (isNumber) {
        query.andWhere('user.id = :id', {
          id: Number(search),
        });
      } else {
        query.andWhere(
          `(
            LOWER(user.firstName) LIKE LOWER(:search)
            OR LOWER(user.lastName) LIKE LOWER(:search)
            OR LOWER(CONCAT(user.firstName, ' ', user.lastName)) LIKE LOWER(:search)
            OR LOWER(user.username) LIKE LOWER(:search)
            OR LOWER(user.email) LIKE LOWER(:search)
          )`,
          {
            search: `%${search}%`,
          },
        );
      }
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
        .leftJoinAndSelect('user.serviceAreas', 'serviceAreas')
        .leftJoinAndMapMany('user.purohitServices', 'purohit_services', 'purohitServices', 'purohitServices.purohitId = profile.id').leftJoinAndMapOne('purohitServices.service', 'services', 'service', 'service.id = purohitServices.serviceId');
    } else if (role === USER_ROLE.CUSTOMER) {
      qb.leftJoinAndSelect('user.addresses', 'addresses');
    }

    return qb.getOne();
  }
}
