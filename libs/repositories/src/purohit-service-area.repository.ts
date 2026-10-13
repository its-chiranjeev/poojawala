import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurohitServiceArea } from '@poojawala/entities';
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
    const isSettingDefault =
      payload.isDefault === true ||
      (payload.isDefault as any) === 'true' ||
      (payload.isDefault as any) === 1 ||
      (payload.isDefault as any) === '1';

    if (isSettingDefault && payload.purohitId) {
      await this.clearDefaultAddress(payload.purohitId);
    }
    const area = this.repo.create(payload);
    return this.repo.save(area);
  }

  async findById(id: number) {
    return this.repo.findOne({
      where: { id },
    });
  }

  async updateArea(id: number, payload: Partial<PurohitServiceArea>) {
    const isSettingDefault =
      payload.isDefault === true ||
      (payload.isDefault as any) === 'true' ||
      (payload.isDefault as any) === 1 ||
      (payload.isDefault as any) === '1';

    if (isSettingDefault) {
      const area = await this.findById(id);
      if (area && area.purohitId) {
        await this.clearDefaultAddress(area.purohitId);
      }
    }
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

  async findServiceAreas(
    purohitId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    state?: string,
  ) {
    const query = this.repo
      .createQueryBuilder('area')
      .where('area.purohitId = :purohitId', { purohitId })
      .andWhere('area.deletedAt IS NULL');

    if (state && state.trim() !== '') {
      query.andWhere('area.state ILIKE :state', {
        state: `%${state.trim()}%`,
      });
    }

    if (search && search.trim() !== '') {
      query.andWhere(
        '(CAST(area.id AS TEXT) ILIKE :search OR area.addressLabel ILIKE :search OR area.streetName ILIKE :search OR area.fullAddress ILIKE :search OR area.city ILIKE :search OR area.state ILIKE :search OR area.pincode ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    query
      .orderBy('area.isDefault', 'DESC')
      .addOrderBy('area.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async deleteArea(id: number): Promise<void> {
    await this.repo.softDelete(id);
  }
}
