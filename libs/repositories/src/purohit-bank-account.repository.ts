import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitBankAccount } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PurohitBankAccountRepository extends BaseRepository<PurohitBankAccount> {
  constructor(
    @InjectRepository(PurohitBankAccount)
    repo: Repository<PurohitBankAccount>,
  ) {
    super(repo);
  }

  async findByPurohitId(purohitId: number) {
    return this.repo.find({
      where: { purohitId },
      order: { id: 'ASC' },
    });
  }

  async findBankAccounts(
    purohitId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const query = this.repo
      .createQueryBuilder('account')
      .where('account.purohitId = :purohitId', { purohitId });

    if (search) {
      query.andWhere(
        '(account.accountHolderName ILIKE :search OR account.accountNumber ILIKE :search OR account.ifscCode ILIKE :search OR account.bankName ILIKE :search OR account.upiId ILIKE :search)',
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

  async findPrimaryAccount(purohitId: number) {
    return this.repo.findOne({
      where: {
        purohitId,
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

  async clearPrimaryAccount(purohitId: number) {
    await this.repo.update({ purohitId }, { isPrimary: false });
  }

  async createAccount(data: Partial<PurohitBankAccount>) {
    const account = this.repo.create(data);
    return this.repo.save(account);
  }

  async updateAccount(id: number, data: Partial<PurohitBankAccount>) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async deleteAccount(id: number) {
    return this.repo.softDelete(id);
  }
}