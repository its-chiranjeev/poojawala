import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class ComplaintRepository extends BaseRepository<Complaint> {
  constructor(
    @InjectRepository(Complaint)
    repo: Repository<Complaint>,
  ) {
    super(repo);
  }
}
