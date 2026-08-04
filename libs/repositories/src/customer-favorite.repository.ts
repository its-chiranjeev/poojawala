import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerFavorite } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class CustomerFavoriteRepository extends BaseRepository<CustomerFavorite> {
  constructor(
    @InjectRepository(CustomerFavorite)
    repo: Repository<CustomerFavorite>,
  ) {
    super(repo);
  }

  async createFavorite(customerId: number, purohitId: number) {
    const favorite = this.repo.create({
      customerId,
      purohitId,
    });

    return this.repo.save(favorite);
     
    return favorite;
  }

  async findFavorite(
    customerId: number,
    purohitId: number,
  ) {
    return this.repo.findOne({
      where: {
        customerId,
        purohitId,
      },
      withDeleted: true,
    });
  }

  async getFavoritesByCustomerId(customerId: number) {
    return this.repo.find({
      where: {
        customerId,
      },
      relations: {
        purohit: {
          user: true,
        },
      },
    });
  }

  async removeFavorite(
    customerId: number,
    purohitId: number,
  ) {
    const favorite = await this.repo.findOne({
      where: {
        customerId,
        purohitId,
      },
    });

    if (!favorite) {
      return null;
    }

    await this.repo.softDelete(favorite.id);

    return favorite;
  }
  
  async restoreFavorite(id: number) {
    await this.repo.restore(id);
  }

}
