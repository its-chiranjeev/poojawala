import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, CATEGORY_TYPE } from '@poojawala/entities';
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
    const { page = 1, limit = 10, search, isActive, categoryId, categoryType } = query;

    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      parsedIsActive = String(isActive) === 'true';
    }

    const qb = this.repo.createQueryBuilder('product');
    qb.where('product.deletedAt IS NULL');

    // Join category relation for category data in response
    qb.leftJoinAndSelect('product.category', 'category', 'category.deletedAt IS NULL');

    // Products associated with SERVICE categories must never appear in product results.
    // Products without a category (categoryId IS NULL) remain visible when no category filter is supplied.
    qb.andWhere('(product.categoryId IS NULL OR category.categoryType = :defaultProductType)', {
      defaultProductType: CATEGORY_TYPE.PRODUCT,
    });

    if (parsedIsActive !== undefined) {
      qb.andWhere('product.isActive = :isActive', { isActive: parsedIsActive });
    }

    if (search && search.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${search.trim()}%`,
      });
    }

    // Filter by category ID when provided
    if (categoryId !== undefined && categoryId !== null) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId });
    }

    // Filter by category's type when provided (e.g. PRODUCT)
    if (categoryType) {
      qb.andWhere('category.categoryType = :categoryType', { categoryType });
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
