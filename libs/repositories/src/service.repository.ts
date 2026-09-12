import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Service, Booking } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';

@Injectable()
export class ServiceRepository extends BaseRepository<Service> {
  constructor(
    @InjectRepository(Service)
    repo: Repository<Service>,
  ) {
    super(repo);
  }

  async findAllServices(query: GetServicesQueryDto) {
    const { page = 1, limit = 10, search, isActive, isUpcomingFestival } = query;
    console.log("=== API REQUEST RECEIVED ===");
    console.log("Original query object:", query);

    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined) {
      parsedIsActive = String(isActive) === 'true';
    }

    console.log("Parsed isActive:", parsedIsActive);

    let parsedIsUpcomingFestival: boolean | undefined = undefined;
    if (isUpcomingFestival !== undefined) {
      parsedIsUpcomingFestival = String(isUpcomingFestival) === 'true';
    }

    const where: any = {
      ...(parsedIsActive !== undefined && { isActive: parsedIsActive }),
      ...(parsedIsUpcomingFestival !== undefined && { isUpcomingFestival: parsedIsUpcomingFestival }),
      ...(search && {
        name: ILike(`%${search}%`),
      }),
    };

    const [services, total] = await this.repo.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        minPrice: true,
        maxPrice: true,
        commissionPercentage: true,
        durationMinutes: true,
        requiresVenue: true,
        isActive: true,
        isUpcomingFestival: true,
        festivalStartDate: true,
        festivalEndDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Fetch total bookings from booking table for each service
    let servicesWithBookings: any[] = services;
    if (services && services.length > 0) {
      const serviceIds = services.map((s) => s.id);
      const bookingCounts: { serviceId: string | number; count: string | number }[] =
        await this.repo.manager
          .createQueryBuilder(Booking, 'booking')
          .select('booking.serviceId', 'serviceId')
          .addSelect('COUNT(booking.id)', 'count')
          .where('booking.serviceId IN (:...serviceIds)', { serviceIds })
          .andWhere('booking.deletedAt IS NULL')
          .groupBy('booking.serviceId')
          .getRawMany();

      const countMap = new Map<number, number>();
      bookingCounts.forEach((bc) => {
        countMap.set(Number(bc.serviceId), parseInt(String(bc.count), 10) || 0);
      });

      servicesWithBookings = services.map((service) => ({
        ...service,
        totalBookings: countMap.get(service.id) || 0,
      }));
    }

    // TODO: Old return without totalBookings from booking table:
    // return {
    //   data: services,
    //   page,
    //   limit,
    //   total,
    //   totalPages: Math.ceil(total / limit),
    // };

    return {
      data: servicesWithBookings,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  create(data: Partial<Service>) {
    return this.repo.create(data);
  }

  save(service: Service) {
    return this.repo.save(service);
  }

  async findById(id: number): Promise<any | null> {
    const service = await this.repo.findOne({
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        minPrice: true,
        maxPrice: true,
        commissionPercentage: true,
        durationMinutes: true,
        requiresVenue: true,
        isActive: true,
        isUpcomingFestival: true,
        festivalStartDate: true,
        festivalEndDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (service) {
      const bookingCount = await this.repo.manager
        .createQueryBuilder(Booking, 'booking')
        .where('booking.serviceId = :id', { id })
        .andWhere('booking.deletedAt IS NULL')
        .getCount();

      return {
        ...service,
        totalBookings: bookingCount,
      };
    }

    // TODO: Old return without totalBookings from booking table:
    // return service;

    return service;
  }

  async remove(service: Service): Promise<Service> {
    return this.repo.remove(service);
  }
}
