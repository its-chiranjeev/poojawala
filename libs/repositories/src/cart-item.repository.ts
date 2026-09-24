import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CartItem } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CartItemRepository extends BaseRepository<CartItem> {
  constructor(
    @InjectRepository(CartItem)
    repo: Repository<CartItem>,
  ) {
    super(repo);
  }

  async findByCartAndProduct(
    cartId: number,
    productId: number,
    manager?: EntityManager,
  ): Promise<CartItem | null> {
    const repo = manager ? manager.getRepository(CartItem) : this.repo;
    return repo.findOne({
      where: { cartId, productId },
      relations: ['product'],
    });
  }

  async findByCartAndItemId(
    cartId: number,
    itemId: number,
    manager?: EntityManager,
  ): Promise<CartItem | null> {
    const repo = manager ? manager.getRepository(CartItem) : this.repo;
    return repo.findOne({
      where: { id: itemId, cartId },
      relations: ['product', 'cart'],
    });
  }

  async countItems(cartId: number): Promise<number> {
    return this.repo.count({
      where: { cartId },
    });
  }

  async removeByCartId(cartId: number, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CartItem) : this.repo;
    await repo.delete({ cartId });
  }

  async removeCartItem(itemId: number, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CartItem) : this.repo;
    await repo.delete(itemId);
  }

  async findCartItemsWithPagination(
    cartId: number,
    query?: { page?: number; limit?: number; search?: string },
  ): Promise<{ items: CartItem[]; totalItems: number }> {
    const page = query?.page && Number(query.page) > 0 ? Number(query.page) : 1;
    const limit =
      query?.limit && Number(query.limit) > 0 ? Number(query.limit) : 10;
    const skip = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('item')
      .innerJoinAndSelect(
        'item.product',
        'product',
        'product.deletedAt IS NULL AND product.isActive = true',
      )
      .where('item.cartId = :cartId', { cartId });

    if (query?.search && query.search.trim() !== '') {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${query.search.trim()}%`,
      });
    }

    qb.orderBy('item.createdAt', 'DESC').skip(skip).take(limit);

    const [items, totalItems] = await qb.getManyAndCount();
    return { items, totalItems };
  }

  async findAllValidItemsByCartId(
    cartId: number,
    search?: string,
  ): Promise<CartItem[]> {
    const qb = this.repo
      .createQueryBuilder('item')
      .innerJoinAndSelect(
        'item.product',
        'product',
        'product.deletedAt IS NULL AND product.isActive = true',
      )
      .where('item.cartId = :cartId', { cartId });

    if (search && search.trim() !== '') {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${search.trim()}%`,
      });
    }

    return qb.orderBy('item.createdAt', 'DESC').getMany();
  }
}
