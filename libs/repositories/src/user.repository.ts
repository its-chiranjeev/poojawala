import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';
import { Brackets } from 'typeorm';
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { Not } from 'typeorm';
import { GetAllUsersDto } from '@likemyproduct/dtos/user/get-all-users.dto';

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

  async updateUser(
    id: string | number,
    payload: Partial<User>,
  ) {
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
    return this.repo.findOne({where: { id } as any});
  }
}
