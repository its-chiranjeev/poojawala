import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Cart } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CartRepository extends BaseRepository<Cart> {
  constructor(
    @InjectRepository(Cart)
    repo: Repository<Cart>,
  ) {
    super(repo);
  }

  async findOrCreateCart(
    customerId: number,
    manager?: EntityManager,
  ): Promise<Cart> {
    const repo = manager ? manager.getRepository(Cart) : this.repo;

    let cart = await repo.findOne({
      where: { customerId },
    });

    if (!cart) {
      cart = repo.create({ customerId });
      cart = await repo.save(cart);
    }

    return cart;
  }

  async findCartWithItems(customerId: number): Promise<Cart | null> {
    return this.repo
      .createQueryBuilder('cart')
      .leftJoinAndSelect('cart.items', 'item')
      .leftJoinAndSelect(
        'item.product',
        'product',
        'product.deletedAt IS NULL AND product.isActive = true',
      )
      .where('cart.customerId = :customerId', { customerId })
      .orderBy('item.createdAt', 'ASC')
      .getOne();
  }
}
