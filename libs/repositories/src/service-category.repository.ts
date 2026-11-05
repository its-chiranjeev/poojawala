import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CATEGORY_TYPE, Category } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';

@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
  constructor(
    @InjectRepository(Category)
    repo: Repository<Category>,
  ) {
    super(repo);
  }

  async findAllCategories(query: GetServicesQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const { search, isActive, categoryType } = query;

    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      if (typeof isActive === 'boolean') {
        parsedIsActive = isActive;
      } else {
        parsedIsActive = String(isActive).toLowerCase() === 'true';
      }
    }

    // Resolve categoryType filter:
    // - PRODUCT: only product categories
    // - SERVICE: only service categories
    // - Omitted / ALL: returns all categories (both SERVICE and PRODUCT)
    let resolvedCategoryType: CATEGORY_TYPE | undefined = undefined;
    if (categoryType && String(categoryType).trim() !== '') {
      const upper = String(categoryType).trim().toUpperCase();
      if (upper === CATEGORY_TYPE.PRODUCT) {
        resolvedCategoryType = CATEGORY_TYPE.PRODUCT;
      } else if (upper === CATEGORY_TYPE.SERVICE) {
        resolvedCategoryType = CATEGORY_TYPE.SERVICE;
      }
      // 'ALL' leaves resolvedCategoryType as undefined (all categories returned)
    }

    const qb = this.repo
      .createQueryBuilder('category')
      .where('category.deletedAt IS NULL');

    // Filter by categoryType only if explicitly specified
    if (resolvedCategoryType) {
      qb.andWhere('category.categoryType = :categoryType', { categoryType: resolvedCategoryType });
    }

    // 1. isActive filter
    if (parsedIsActive !== undefined) {
      qb.andWhere('category.isActive = :isActive', { isActive: parsedIsActive });
    }

    // 2. Search filter (by name or description)
    if (search && search.trim() !== '') {
      qb.andWhere(
        '(CAST(category.id AS TEXT) ILIKE :search OR category.name ILIKE :search OR category.description ILIKE :search)',
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
    if (includeServices && resolvedCategoryType !== CATEGORY_TYPE.PRODUCT) {
      qb.leftJoinAndSelect('category.services', 'services', 'services.deletedAt IS NULL');
    }

    // 5. Load relation counts of total services & total products under each category
    qb.loadRelationCountAndMap('category.totalServices', 'category.services');
    qb.loadRelationCountAndMap('category.totalProducts', 'category.products');

    const sortRaw = (query.sort ?? (query as any).order ?? (query as any).sortOrder)?.toString().trim().toUpperCase();
    const sortDirection: 'ASC' | 'DESC' = sortRaw === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy('category.createdAt', sortDirection).addOrderBy('category.id', sortDirection);

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

  /**
   * Find a category by name AND type.
   * Used to enforce the composite unique constraint at the application layer
   * before hitting the database, providing a user-friendly error message.
   */
  async findByNameAndType(name: string, categoryType: CATEGORY_TYPE): Promise<Category | null> {
    return this.repo.findOne({
      where: { name: ILike(name), categoryType },
    });
  }

  /**
   * @deprecated Use findByNameAndType for composite uniqueness checks.
   * Kept for backward-compatibility with any callers that have not yet
   * been updated. Returns the first match regardless of type.
   */
  async findByName(name: string): Promise<Category | null> {
    return this.repo.findOne({
      where: { name: ILike(name) },
    });
  }

  /**
   * Counts active (non-deleted) products assigned to the given category ID.
   * Used by service.service.ts to guard against deleting or type-changing a
   * PRODUCT category that still has assigned products.
   */
  async countProductsForCategory(categoryId: number): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .select('COUNT(*)', 'cnt')
      .from('products', 'p')
      .where('p."categoryId" = :id', { id: categoryId })
      .andWhere('p."deletedAt" IS NULL')
      .getRawOne<{ cnt: string }>();
    return Number(result?.cnt ?? 0);
  }
}

// Backward-compat alias — remove once all direct imports are migrated
export { CategoryRepository as ServiceCategoryRepository };
