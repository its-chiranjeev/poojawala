import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitServiceArea } from '@likemyproduct/entities';
import { BaseRepository } from './baseDb.repository';

@Injectable()
export class PurohitServiceAreaRepository extends BaseRepository<PurohitServiceArea> {
  constructor(
    @InjectRepository(PurohitServiceArea)
    repo: Repository<PurohitServiceArea>,
  ) {
    super(repo);
  }

  async clearDefaultAddress(purohitId: number): Promise<void> {
    await this.repo.update(
      { purohitId, isDefault: true },
      { isDefault: false },
    );
  }

  async createArea(
    payload: Partial<PurohitServiceArea>,
  ): Promise<PurohitServiceArea> {
    const area = this.repo.create(payload);
    return this.repo.save(area);
  }

  async findById(id: number) {
    return this.repo.findOne({
      where: { id },
    });
  }

  async updateArea(id: number, payload: Partial<PurohitServiceArea>) {
    await this.repo.update(id, payload);
    return this.findById(id);
  }

  async findByPurohitAndPincode(
    purohitId: number,
    pincode: string,
  ): Promise<PurohitServiceArea | null> {
    return this.repo.findOne({
      where: {
        purohitId,
        pincode,
      },
    });
  }

  async findByPurohitId(purohitId: number): Promise<PurohitServiceArea[]> {
    return this.repo.find({
      where: { purohitId },
      order: {
        isDefault: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async deleteArea(id: number): Promise<void> {
    await this.repo.softDelete(id);
  }
}
