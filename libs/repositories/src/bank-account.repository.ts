import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class BankAccountRepository extends BaseRepository<BankAccount> {
  constructor(
    @InjectRepository(BankAccount)
    repo: Repository<BankAccount>,
  ) {
    super(repo);
  }

  async findByUserId(userId: number) {
    return this.repo.find({
      where: { userId },
      order: {
        isPrimary: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findBankAccounts(
    userId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const query = this.repo
      .createQueryBuilder('account')
      .where('account.userId = :userId', { userId });

    if (search) {
      query.andWhere(
        '(CAST(account.id AS TEXT) ILIKE :search OR account.accountHolderName ILIKE :search OR account.accountNumber ILIKE :search OR account.ifscCode ILIKE :search OR account.bankName ILIKE :search OR account.upiId ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    query
      .orderBy('account.isPrimary', 'DESC')
      .addOrderBy('account.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findPrimaryAccount(userId: number) {
    return this.repo.findOne({
      where: {
        userId,
        isPrimary: true,
      },
    });
  }

  async findById(id: number) {
    return this.repo.findOne({
      where: { id },
    });
  }

  async findByAccountNumber(accountNumber: string) {
    return this.repo.findOne({
      where: { accountNumber },
    });
  }

  async clearPrimaryAccount(userId: number) {
    await this.repo.update({ userId }, { isPrimary: false });
  }

  async createAccount(data: Partial<BankAccount>) {
    const account = this.repo.create(data);
    return this.repo.save(account);
  }

  async updateAccount(id: number, data: Partial<BankAccount>) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async deleteAccount(id: number) {
    await this.repo.softDelete(id);
  }
}