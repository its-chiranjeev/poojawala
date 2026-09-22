import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetProductsQueryDto } from '@poojawala/dtos';

@Injectable()
export class ProductRepository extends BaseRepository<Product> {
  constructor(
    @InjectRepository(Product)
    repo: Repository<Product>,
  ) {
    super(repo);
  }

  async findAllProducts(query: GetProductsQueryDto) {
    const { page = 1, limit = 10, search, isActive } = query;

    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      parsedIsActive = String(isActive) === 'true';
    }

    const qb = this.repo.createQueryBuilder('product');
    qb.where('product.deletedAt IS NULL');

    if (parsedIsActive !== undefined) {
      qb.andWhere('product.isActive = :isActive', { isActive: parsedIsActive });
    }

    if (search && search.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${search.trim()}%`,
      });
    }

    qb.orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [products, total] = await qb.getManyAndCount();

    return {
      data: products,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    };
  }
}

