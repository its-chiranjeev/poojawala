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

  async findAddresses(
    customerId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const query = this.repo
      .createQueryBuilder('address')
      .where('address.customerId = :customerId', { customerId });

    if (search && search.trim() !== '') {
      query.andWhere(
        '(CAST(address.id AS TEXT) ILIKE :search OR address.addressLabel ILIKE :search OR address.fullAddress ILIKE :search OR address.city ILIKE :search OR address.pincode ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    query
      .orderBy('address.isDefault', 'DESC')
      .addOrderBy('address.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findByCustomerId(customerId: number): Promise<CustomerAddress[]> {
    return this.repo.find({
      where: { customerId },
      order: {
        isDefault: 'DESC',
        createdAt: 'DESC',
      },
    });
  }
}
