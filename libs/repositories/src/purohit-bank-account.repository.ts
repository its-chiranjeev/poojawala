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

  async findPrimaryAccount(purohitId: number) {
    return this.repo.findOne({
      where: {
        purohitId,
        isPrimary: true,
      },
    });
  }
}