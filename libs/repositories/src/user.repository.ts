import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';
import { USER_ROLE, USER_STATUS } from '@likemyproduct/entities';
import { Not } from 'typeorm';

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

  async findApprovedPurohits(
    page = 1,
    limit = 10,
    search?: string,
  ) {
    const query = this.repo
    .createQueryBuilder('user')
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

    query
    .skip((page - 1) * limit)
    .take(limit);

    const [users, total] = await query.getManyAndCount();

    const data = users.map((user) => ({
      id: user.id,
      profileImage: user.profileImage,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      isActive: user.status === USER_STATUS.ACTIVE,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

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
}
