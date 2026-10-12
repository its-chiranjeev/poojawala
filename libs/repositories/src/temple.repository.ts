import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Temple, Service } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetTemplesQueryDto } from '@poojawala/dtos';

@Injectable()
export class TempleRepository extends BaseRepository<Temple> {
  constructor(
    @InjectRepository(Temple)
    repo: Repository<Temple>,
  ) {
    super(repo);
  }

  async findAllTemples(query: GetTemplesQueryDto, isAdmin: boolean = false) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { search, city, state } = query;

    const qb = this.repo.createQueryBuilder('temple');
    qb.where('temple.deletedAt IS NULL');

    let parsedIsActive: boolean | undefined = undefined;
    if (
      query.isActive !== undefined &&
      query.isActive !== null &&
      (query.isActive as any) !== ''
    ) {
      if (typeof query.isActive === 'boolean') {
        parsedIsActive = query.isActive;
      } else {
        const str = String(query.isActive).trim().toLowerCase();
        if (str === 'true' || str === '1') parsedIsActive = true;
        if (str === 'false' || str === '0') parsedIsActive = false;
      }
    }

    if (parsedIsActive !== undefined) {
      qb.andWhere('temple.isActive = :isActive', { isActive: parsedIsActive });
    } else if (!isAdmin) {
      qb.andWhere('temple.isActive = :isActive', { isActive: true });
    }

    if (search && search.trim()) {
      qb.andWhere(
        '(CAST(temple.id AS TEXT) ILIKE :search OR temple.name ILIKE :search OR temple.city ILIKE :search OR temple.state ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    if (city && city.trim()) {
      qb.andWhere('temple.city ILIKE :city', { city: `%${city.trim()}%` });
    }

    if (state && state.trim()) {
      qb.andWhere('temple.state ILIKE :state', { state: `%${state.trim()}%` });
    }

    qb.orderBy('temple.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [temples, total] = await qb.getManyAndCount();

    return {
      data: temples,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findTempleById(id: number, isAdmin: boolean = false): Promise<Temple | null> {
    const qb = this.repo.createQueryBuilder('temple');
    qb.where('temple.id = :id', { id });
    qb.andWhere('temple.deletedAt IS NULL');

    if (!isAdmin) {
      qb.andWhere('temple.isActive = :isActive', { isActive: true });
    }

    return qb.getOne();
  }

  async findActiveServicesByTempleId(templeId: number): Promise<Service[]> {
    return this.repo.manager
      .createQueryBuilder(Service, 'service')
      .select([
        'service.id',
        'service.name',
        'service.slug',
        'service.description',
        'service.isActive',
        'service.plans'
      ])
      .where('service.templeId = :templeId', { templeId })
      .andWhere('service.deletedAt IS NULL')
      .andWhere('service.isActive = :isActive', { isActive: true })
      .orderBy('service.createdAt', 'DESC')
      .getMany();
  }
}
