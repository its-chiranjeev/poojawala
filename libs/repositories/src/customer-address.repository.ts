import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerAddress } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CustomerAddressRepository extends BaseRepository<CustomerAddress> {
  constructor(
    @InjectRepository(CustomerAddress)
    repo: Repository<CustomerAddress>,
  ) {
    super(repo);
  }

  async clearDefaultAddress(customerId: number): Promise<void> {
    await this.repo.update(
      { customerId, isDefault: true },
      { isDefault: false },
    );
  }

  async createAddress(
    payload: Partial<CustomerAddress>,
  ): Promise<CustomerAddress> {
    const address = this.repo.create(payload);
    return await this.repo.save(address);
  }
}
