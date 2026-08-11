import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Otp } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class OtpRepository extends BaseRepository<Otp> {
  constructor(
    @InjectRepository(Otp)
    repo: Repository<Otp>,
  ) {
    super(repo);
  }
}
