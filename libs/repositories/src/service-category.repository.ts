import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ServiceCategory } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';

@Injectable()
export class ServiceCategoryRepository extends BaseRepository<ServiceCategory> {
  constructor(
    @InjectRepository(ServiceCategory)
    repo: Repository<ServiceCategory>,
  ) {
    super(repo);
  }

  async findAllCategories(query: GetServicesQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { search, isActive } = query;

    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      if (typeof isActive === 'boolean') {
        parsedIsActive = isActive;
      } else {
        parsedIsActive = String(isActive).toLowerCase() === 'true';
      }
    }

    const qb = this.repo
      .createQueryBuilder('category')
      .where('category.deletedAt IS NULL');

    // 1. isActive filter
    if (parsedIsActive !== undefined) {
      qb.andWhere('category.isActive = :isActive', { isActive: parsedIsActive });
    }

    // 2. Search filter (by name or description)
    if (search && search.trim() !== '') {
      qb.andWhere(
        '(category.name ILIKE :search OR category.description ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    // 3. Service filter (categories that contain a specific service by ID or slug)
    const serviceFilter = query.serviceId ?? query.service;
    if (serviceFilter !== undefined && serviceFilter !== null && serviceFilter !== '') {
      const numServiceId = Number(serviceFilter);
      if (!isNaN(numServiceId)) {
        qb.innerJoin(
          'category.services',
          'srvFilter',
          'srvFilter.id = :srvId AND srvFilter.deletedAt IS NULL',
          { srvId: numServiceId },
        );
      } else {
        qb.innerJoin(
          'category.services',
          'srvFilter',
          'srvFilter.slug = :srvSlug AND srvFilter.deletedAt IS NULL',
          { srvSlug: String(serviceFilter).trim() },
        );
      }
    }

    // 4. Optionally include child services
    const includeServices =
      String(query.includeServices).toLowerCase() === 'true' ||
      (query as any).includeServices === true;
    if (includeServices) {
      qb.leftJoinAndSelect('category.services', 'services', 'services.deletedAt IS NULL');
    }

    // 5. Load relation count of total services under each category
    qb.loadRelationCountAndMap('category.totalServices', 'category.services');

    qb.orderBy('category.sortOrder', 'ASC').addOrderBy('category.name', 'ASC');

    // 6. Pagination
    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const categories = await qb.getMany();

    return {
      data: categories,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByName(name: string): Promise<ServiceCategory | null> {
    return this.repo.findOne({
      where: { name: ILike(name) },
    });
  }
}
