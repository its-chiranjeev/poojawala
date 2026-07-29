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

  async findApprovedPurohits() {
    return this.repo.find({
      where: {
        role: USER_ROLE.PUROHIT,
        status: USER_STATUS.ACTIVE,
      },
    });
  }
}
