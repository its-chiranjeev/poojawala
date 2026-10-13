import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceFeature, SERVICE_FEATURE_PLAN } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class ServiceFeatureRepository extends BaseRepository<ServiceFeature> {
  constructor(
    @InjectRepository(ServiceFeature)
    repo: Repository<ServiceFeature>,
  ) {
    super(repo);
  }

  async findByServiceId(
    serviceId: number,
    plan?: SERVICE_FEATURE_PLAN,
  ): Promise<ServiceFeature[]> {
    const qb = this.repo
      .createQueryBuilder('feature')
      .where('feature.serviceId = :serviceId', { serviceId })
      .andWhere('feature.deletedAt IS NULL')
      .andWhere('feature.isActive = :isActive', { isActive: true });

    if (plan) {
      qb.andWhere('feature.plan = :plan', { plan });
    }

    return qb.orderBy('feature.id', 'ASC').getMany();
  }

  async softDeleteByServiceId(serviceId: number) {
    return this.repo.softDelete({ serviceId });
  }

  async restoreByServiceId(serviceId: number) {
    return this.repo.restore({ serviceId });
  }
}
