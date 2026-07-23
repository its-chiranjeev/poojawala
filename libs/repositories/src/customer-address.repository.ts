import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerAddress } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CustomerAddressRepository extends BaseRepository<CustomerAddress> {
  constructor(
    @InjectRepository(CustomerAddress)
    repo: Repository<CustomerAddress>,
  ) {
    super(repo);
  }
}
