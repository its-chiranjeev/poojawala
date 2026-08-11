import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Complaint, COMPLAINT_CATEGORY, COMPLAINT_STATUS } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';

export interface FindComplaintsOptions {
  page: number;
  limit: number;
  status?: COMPLAINT_STATUS;
  category?: COMPLAINT_CATEGORY;
  search?: string;
  raisedById?: number;
  fromDate?: string;
  toDate?: string;
}

@Injectable()
export class ComplaintRepository extends BaseRepository<Complaint> {
  constructor(
    @InjectRepository(Complaint)
    repo: Repository<Complaint>,
  ) {
    super(repo);
  }

  async findByComplaintNumber(
    complaintNumber: string,
  ): Promise<Complaint | null> {
    return this.repo.findOne({
      where: {
        complaintNumber,
      },
    });
  }

  async findComplaintById(complaintId: number): Promise<Complaint | null> {
    return this.repo
      .createQueryBuilder('complaint')
      .leftJoin('complaint.raisedBy', 'raisedBy')
      .addSelect([
        'raisedBy.id',
        'raisedBy.firstName',
        'raisedBy.lastName',
        'raisedBy.email',
        'raisedBy.phone',
        'raisedBy.profileImage',
        'raisedBy.role',
        'raisedBy.status',
      ])
      .leftJoin('complaint.booking', 'booking')
      .addSelect([
        'booking.id',
        'booking.bookingNumber',
        'booking.customerId',
        'booking.purohitId',
        'booking.status',
        'booking.scheduledAt',
        'booking.finalAmount',
        'booking.paymentStatus',
      ])
      .leftJoin('booking.service', 'service')
      .addSelect(['service.id', 'service.name', 'service.iconUrl'])
      .leftJoin('complaint.resolvedBy', 'resolvedBy')
      .addSelect([
        'resolvedBy.id',
        'resolvedBy.firstName',
        'resolvedBy.lastName',
        'resolvedBy.role',
      ])
      .where('complaint.id = :complaintId', {
        complaintId,
      })
      .getOne();
  }

  async hasActiveComplaintForBooking(
    bookingId: number,
    raisedById: number,
    category: COMPLAINT_CATEGORY,
  ): Promise<boolean> {
    return this.repo
      .createQueryBuilder('complaint')
      .where('complaint.bookingId = :bookingId', {
        bookingId,
      })
      .andWhere('complaint.raisedById = :raisedById', {
        raisedById,
      })
      .andWhere('complaint.category = :category', {
        category,
      })
      .andWhere('complaint.status IN (:...statuses)', {
        statuses: [COMPLAINT_STATUS.OPEN, COMPLAINT_STATUS.UNDER_REVIEW],
      })
      .getExists();
  }

  async findComplaints(options: FindComplaintsOptions): Promise<{
    complaints: Complaint[];
    total: number;
  }> {
    const query = this.repo
      .createQueryBuilder('complaint')

      .leftJoin('complaint.booking', 'booking')
      .addSelect([
        'booking.id',
        'booking.bookingNumber',
        'booking.customerId',
        'booking.purohitId',
        'booking.status',
        'booking.paymentStatus',
        'booking.scheduledAt',
        'booking.finalAmount',
      ])

      .leftJoin('booking.service', 'service')
      .addSelect(['service.id', 'service.name', 'service.iconUrl'])

      .leftJoin('complaint.raisedBy', 'raisedBy')
      .addSelect([
        'raisedBy.id',
        'raisedBy.firstName',
        'raisedBy.lastName',
        'raisedBy.email',
        'raisedBy.phone',
        'raisedBy.profileImage',
        'raisedBy.role',
        'raisedBy.status',
      ])

      .leftJoin('complaint.resolvedBy', 'resolvedBy')
      .addSelect([
        'resolvedBy.id',
        'resolvedBy.firstName',
        'resolvedBy.lastName',
        'resolvedBy.email',
        'resolvedBy.role',
      ])

    if (options.raisedById) {
      query.andWhere('complaint.raisedById = :raisedById', {
        raisedById: options.raisedById,
      });
    }

    if (options.status) {
      query.andWhere('complaint.status = :status', {
        status: options.status,
      });
    }

    if (options.category) {
      query.andWhere('complaint.category = :category', {
        category: options.category,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;

      query.andWhere(
        `(
          complaint."complaintNumber" ILIKE :search
          OR complaint.subject ILIKE :search
          OR complaint.description ILIKE :search
          OR booking."bookingNumber" ILIKE :search
          OR service.name ILIKE :search
          OR raisedBy."firstName" ILIKE :search
          OR raisedBy."lastName" ILIKE :search
        )`,
        {
          search,
        },
      );
    }

    if (options.fromDate) {
      const fromDate = new Date(options.fromDate);

      query.andWhere('complaint.createdAt >= :fromDate', {
        fromDate,
      });
    }

    if (options.toDate) {
      const toDate = new Date(options.toDate);

      toDate.setHours(23, 59, 59, 999);

      query.andWhere('complaint.createdAt <= :toDate', {
        toDate,
      });
    }

    const skip = (options.page - 1) * options.limit;

    const [complaints, total] = await query
      .orderBy('complaint.createdAt', 'DESC')
      .skip(skip)
      .take(options.limit)
      .getManyAndCount();

    return {
      complaints,
      total,
    };
  }

  async softDeleteComplaint(complaintId: number): Promise<void> {
    await this.repo.softDelete(complaintId);
  }

  async findDeletedComplaintById(
    complaintId: number,
  ): Promise<Complaint | null> {
    return this.repo
      .createQueryBuilder('complaint')
      .withDeleted()
      .where('complaint.id = :complaintId', {
        complaintId,
      })
      .andWhere('complaint.deletedAt IS NOT NULL')
      .getOne();
  }

  async restoreComplaint(complaintId: number): Promise<void> {
    await this.repo.restore(complaintId);
  }
}
