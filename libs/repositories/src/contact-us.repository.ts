import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactUs, CONTACT_US_STATUS } from '@poojawala/entities';

@Injectable()
export class ContactUsRepository {
  constructor(
    @InjectRepository(ContactUs)
    private readonly repo: Repository<ContactUs>,
  ) {}

  async create(data: Partial<ContactUs>): Promise<ContactUs> {
    const newContactUs = this.repo.create(data);
    return this.repo.save(newContactUs);
  }

  async getAll(page: number = 1, limit: number = 10, search?: string, status?: CONTACT_US_STATUS) {
    const query = this.repo.createQueryBuilder('contactUs');

    if (search) {
      query.andWhere(
        '(CAST(contactUs.id AS TEXT) ILIKE :search OR contactUs.name ILIKE :search OR contactUs.email ILIKE :search OR contactUs.subject ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      query.andWhere('contactUs.status = :status', { status });
    }

    query.orderBy('contactUs.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: number): Promise<ContactUs | null> {
    return this.repo.findOne({ where: { id } });
  }

  async updateStatus(id: number, status: CONTACT_US_STATUS): Promise<ContactUs | null> {
    await this.repo.update(id, { status });
    return this.getById(id);
  }

  async softDelete(id: number): Promise<void> {
    await this.repo.softDelete(id);
  }
}
