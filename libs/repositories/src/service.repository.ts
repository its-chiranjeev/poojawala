import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Service } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';
import { GetServicesQueryDto } from '@likemyproduct/dtos/service/get.services.query.dto';

@Injectable()
export class ServiceRepository extends BaseRepository<Service> {
  constructor(
    @InjectRepository(Service)
    repo: Repository<Service>,
  ) {
    super(repo);
  }

  async findAllServices(query: GetServicesQueryDto) {
    const { page = 1, limit = 10, search } = query;

    const where = {
      isActive: true,
      ...(search && {
        name: ILike(`%${search}%`),
      }),
    };

    const [services, total] = await this.repo.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        minPrice: true,
        maxPrice: true,
        commissionPercentage: true,
        durationMinutes: true,
        requiresVenue: true,
        supportsOnline: true,
        supportsOffline: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      data: services,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  create(data: Partial<Service>) {
    return this.repo.create(data);
  }

  save(service: Service) {
    return this.repo.save(service);
  }

  async findById(id: number): Promise<Service | null> {
    return this.repo.findOne({
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        minPrice: true,
        maxPrice: true,
        commissionPercentage: true,
        durationMinutes: true,
        requiresVenue: true,
        supportsOnline: true,
        supportsOffline: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(service: Service): Promise<Service> {
    return this.repo.remove(service);
  }
}
