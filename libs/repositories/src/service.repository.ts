import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, ILike, Repository } from 'typeorm';
import { Service, Booking, PurohitService, Payment } from '@poojawala/entities';
import { BaseRepository } from './baseDb.repository';
import { GetServicesQueryDto } from '@poojawala/dtos';

@Injectable()
export class ServiceRepository extends BaseRepository<Service> {
  constructor(
    @InjectRepository(Service)
    repo: Repository<Service>,
  ) {
    super(repo);
  }

  async findAllServices(query: GetServicesQueryDto, isAdmin: boolean = false) {
    const {
      page = 1,
      limit = 10,
      search,
      isActive,
      isUpcomingFestival,
      isGlobal,
      categoryId,
      category,
      categories,
      templeId,
      temple,
      includeTemple,
      city,
      language,
    } = query;
    console.log("=== API REQUEST RECEIVED ===");
    // console.log("Original query object:", query);

    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined) {
      parsedIsActive = String(isActive) === 'true';
    }

    console.log("Parsed isActive:", parsedIsActive);

    let parsedIsUpcomingFestival: boolean | undefined = undefined;
    if (isUpcomingFestival !== undefined) {
      parsedIsUpcomingFestival = String(isUpcomingFestival) === 'true';
    }

    let parsedIsGlobal: boolean | undefined = undefined;
    if (isGlobal !== undefined) {
      parsedIsGlobal = String(isGlobal) === 'true';
    }

    let parsedIncludeTemple: boolean | undefined = undefined;
    const rawIncludeTemple = includeTemple !== undefined ? includeTemple : (query as any)['includeTemple'];
    if (rawIncludeTemple !== undefined && rawIncludeTemple !== null && String(rawIncludeTemple).trim() !== '') {
      const strVal = String(rawIncludeTemple).trim().toLowerCase();
      if (strVal === 'true' || strVal === '1') {
        parsedIncludeTemple = true;
      } else if (strVal === 'false' || strVal === '0') {
        parsedIncludeTemple = false;
      }
    }

    const qb = this.repo
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.category', 'category')
      .leftJoin('service.temple', 'temple', 'temple.deletedAt IS NULL')
      .addSelect(['temple.id', 'temple.name']);

    let parsedIsOnline: boolean | undefined = undefined;
    if (query.isOnline !== undefined && query.isOnline !== null && String(query.isOnline).trim() !== '') {
      parsedIsOnline = String(query.isOnline).trim().toLowerCase() === 'true';
    }

    let parsedIsOffline: boolean | undefined = undefined;
    if (query.isOffline !== undefined && query.isOffline !== null && String(query.isOffline).trim() !== '') {
      parsedIsOffline = String(query.isOffline).trim().toLowerCase() === 'true';
    }

    if (parsedIsActive !== undefined) {
      qb.andWhere('service.isActive = :isActive', { isActive: parsedIsActive });
    } else if (!isAdmin) {
      qb.andWhere('service.isActive = :isActive', { isActive: true });
    }

    if (parsedIsOnline !== undefined) {
      qb.andWhere('service.isOnline = :isOnline', { isOnline: parsedIsOnline });
    }

    if (parsedIsOffline !== undefined) {
      qb.andWhere('service.isOffline = :isOffline', { isOffline: parsedIsOffline });
    }

    if (parsedIsUpcomingFestival !== undefined) {
      qb.andWhere('service.isUpcomingFestival = :isUpcomingFestival', {
        isUpcomingFestival: parsedIsUpcomingFestival,
      });
    }

    // TODO: Deprecated standalone isGlobal filter applied regardless of city.
    // Previously, isGlobal was checked independently, which could conflict with city-based inclusive filtering.
    // Retained for backward reference.
    /*
    // Filter: isGlobal (true = no city restriction, false = city-specific)
    if (parsedIsGlobal !== undefined) {
      qb.andWhere('service.isGlobal = :isGlobal', { isGlobal: parsedIsGlobal });
    }
    */
    // Standalone isGlobal filter applies only when city is NOT provided and neither isOnline nor isOffline is active.
    // When isOnline=true or isOffline=true is active, all online services or all offline services are returned.
    if (parsedIsGlobal !== undefined && (!city || city.trim() === '') && parsedIsOnline !== true && parsedIsOffline !== true) {
      qb.andWhere('service.isGlobal = :isGlobal', { isGlobal: parsedIsGlobal });
    }

    // Filter: category / categoryId / categories
    if (categoryId !== undefined) {
      qb.andWhere('service.categoryId = :categoryId', { categoryId });
    } else if (category && String(category).trim() !== '') {
      const catVal = String(category).trim();
      const num = Number(catVal);
      if (!isNaN(num)) {
        qb.andWhere('service.categoryId = :catId', { catId: num });
      } else {
        qb.andWhere('LOWER(category.name) = LOWER(:catName)', { catName: catVal });
      }
    }

    if (categories && String(categories).trim() !== '') {
      const catIds = String(categories)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
      if (catIds.length > 0) {
        qb.andWhere('service.categoryId IN (:...catIds)', { catIds });
      }
    }

    // Filter: temple / templeId
    // If templeId is specified, filter only by that templeId.
    // If templeId is 'null', filter independent services (templeId IS NULL).
    // If no temple filter is provided, return both temple-specific and independent services.
    const rawTempleId = templeId !== undefined ? templeId : (query as any)['templeId'];
    if (rawTempleId !== undefined && rawTempleId !== null && String(rawTempleId).trim() !== '') {
      const strVal = String(rawTempleId).trim();
      if (strVal.toLowerCase() === 'all') {
        // Show all services (both independent and temple services)
      } else if (strVal.toLowerCase() === 'null') {
        qb.andWhere('service.templeId IS NULL');
      } else {
        const num = Number(strVal);
        if (!isNaN(num)) {
          qb.andWhere('service.templeId = :templeId', { templeId: num });
        }
      }
    } else if (temple && String(temple).trim() !== '') {
      const templeVal = String(temple).trim();
      if (templeVal.toLowerCase() === 'all') {
        // Show all services (both independent and temple services)
      } else if (templeVal.toLowerCase() === 'null') {
        qb.andWhere('service.templeId IS NULL');
      } else {
        const num = Number(templeVal);
        if (!isNaN(num)) {
          qb.andWhere('service.templeId = :templeId', { templeId: num });
        } else {
          qb.andWhere('LOWER(temple.name) = LOWER(:templeName)', { templeName: templeVal });
        }
      }
    }

    // Filter: includeTemple
    // true  -> return services with non-null templeId
    // false -> return services with null templeId
    // not given -> as it is
    if (parsedIncludeTemple === true) {
      qb.andWhere('service.templeId IS NOT NULL');
    } else if (parsedIncludeTemple === false) {
      qb.andWhere('service.templeId IS NULL');
    }

    if (search) {
      qb.andWhere(
        '(CAST(service.id AS TEXT) ILIKE :search OR service.name ILIKE :search OR category.name ILIKE :search OR temple.name ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    // TODO: Deprecated city-only filtering.
    // Global services were previously excluded when a city was provided.
    // Retained for backward reference.
    /*
    if (city) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(service.cities) AS c
          WHERE LOWER(TRIM(c->>'name')) = LOWER(TRIM(:city))
        )`,
        { city: city.trim() },
      );
    }
    */
    // TODO: Deprecated inclusive city filter without service.isOnline global availability.
    // Retained for backward reference:
    /*
    const normalizedCity = city ? city.trim() : undefined;
    if (normalizedCity && normalizedCity !== '') {
      const cityFilterJson = JSON.stringify([{ name: normalizedCity }]);
      qb.andWhere(
        `(
          service.isGlobal = true
          OR service.cities @> :cityFilter::jsonb
          OR (
            jsonb_typeof(service.cities) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(service.cities) AS c
              WHERE LOWER(TRIM(c->>'name')) = LOWER(TRIM(:city))
            )
          )
        )`,
        {
          city: normalizedCity,
          cityFilter: cityFilterJson,
        },
      );
    }
    */
    // Production inclusive city & online filter:
    // When a city filter IS provided:
    // When isOnline=true: all online services are returned (available globally).
    // When isOffline=true: all offline services are returned (all global offline + all city-specific offline).
    // When city filter is provided (without isOnline=true or isOffline=true):
    // Include online services and offline services matching that city (or global).
    const normalizedCity = city ? city.trim() : undefined;
    if (normalizedCity && normalizedCity !== '' && parsedIsOnline !== true && parsedIsOffline !== true) {
      const cityFilterJson = JSON.stringify([{ name: normalizedCity }]);
      qb.andWhere(
        new Brackets((cityQb) => {
          cityQb
            .where('service.isOnline = true')
            .orWhere(
              new Brackets((offlineQb) => {
                offlineQb
                  .where('(service.isOffline = true OR service.isOffline IS NULL)')
                  .andWhere(
                    new Brackets((cityMatchQb) => {
                      cityMatchQb
                        .where('service.isGlobal = true')
                        .orWhere('service.cities IS NULL')
                        .orWhere("service.cities = '[]'::jsonb")
                        .orWhere(
                          "(jsonb_typeof(service.cities) = 'array' AND jsonb_array_length(service.cities) = 0)",
                        )
                        .orWhere('service.cities @> :cityFilter::jsonb')
                        .orWhere(
                          `(
                            jsonb_typeof(service.cities) = 'array'
                            AND EXISTS (
                              SELECT 1 FROM jsonb_array_elements(service.cities) AS c
                              WHERE LOWER(TRIM(c->>'name')) = LOWER(TRIM(:city))
                            )
                          )`,
                        );
                    }),
                  );
              }),
            );
        }),
        {
          city: normalizedCity,
          cityFilter: cityFilterJson,
        },
      );
    }
    // TODO: Deprecated online-only restriction when no city parameter is provided.
    // Retained for reference:
    /*
    else if (!isAdmin && parsedIsOnline === undefined) {
      qb.andWhere('service.isOnline = true');
    }
    */

    if (language) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(service.languages) AS l
          WHERE LOWER(TRIM(l->>'name')) = LOWER(TRIM(:language))
        )`,
        { language: language.trim() },
      );
    }

    qb.orderBy('service.sortOrder', 'ASC', 'NULLS LAST')
      .addOrderBy('service.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [services, total] = await qb.getManyAndCount();

    // TODO: Previous mapping with only totalBookings kept for reference:
    /*
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
    */

    // Fetch total bookings from booking table and online/offline purohit counts from purohit_services for each service
    let servicesWithBookings: any[] = services;
    if (services && services.length > 0) {
      const serviceIds = services.map((s) => s.id);

      // 1. Fetch total bookings from booking table
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

      // 2. Fetch count of purohits providing that service (online vs offline)
      const purohitCounts: {
        serviceId: string | number;
        onlineCount: string | number;
        offlineCount: string | number;
      }[] = await this.repo.manager
        .createQueryBuilder(PurohitService, 'ps')
        .select('ps.serviceId', 'serviceId')
        .addSelect(
          'COUNT(DISTINCT CASE WHEN ps.isOnline = true AND (ps.isActive = true OR ps.isActive IS NULL) THEN ps.purohitId END)',
          'onlineCount',
        )
        .addSelect(
          'COUNT(DISTINCT CASE WHEN ps.isOffline = true AND (ps.isActive = true OR ps.isActive IS NULL) THEN ps.purohitId END)',
          'offlineCount',
        )
        .where('ps.serviceId IN (:...serviceIds)', { serviceIds })
        .andWhere('ps.deletedAt IS NULL')
        .groupBy('ps.serviceId')
        .getRawMany();

      const onlineCountMap = new Map<number, number>();
      const offlineCountMap = new Map<number, number>();
      purohitCounts.forEach((pc) => {
        onlineCountMap.set(Number(pc.serviceId), parseInt(String(pc.onlineCount), 10) || 0);
        offlineCountMap.set(Number(pc.serviceId), parseInt(String(pc.offlineCount), 10) || 0);
      });

      servicesWithBookings = services.map((service) => {
        const onlineCount = onlineCountMap.get(service.id) || 0;
        const offlineCount = offlineCountMap.get(service.id) || 0;
        return {
          ...service,
          slug: service.slug ?? null,
          templeId: service.templeId ?? null,
          temple: service.temple ? { id: service.temple.id, name: service.temple.name } : null,
          cities: service.cities ?? [],
          languages: service.languages ?? [],
          benefits: service.benefits ?? [],
          purohitCarryItems: service.purohitCarryItems ?? [],
          sortOrder: Number(service.sortOrder ?? 0),
          totalBookings: countMap.get(service.id) || 0,
          onlinepurohitCount: onlineCount,
          offlinepurohitCount: offlineCount,
        };
      });
    } else if (services && services.length > 0) {
      servicesWithBookings = services.map((service) => ({
        ...service,
        slug: service.slug ?? null,
        templeId: service.templeId ?? null,
        temple: service.temple ? { id: service.temple.id, name: service.temple.name } : null,
        cities: service.cities ?? [],
        languages: service.languages ?? [],
        benefits: service.benefits ?? [],
        purohitCarryItems: service.purohitCarryItems ?? [],
        sortOrder: Number(service.sortOrder ?? 0),
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
        // isActive: true,
      },
      relations: ['category', 'temple'],
      select: {
        id: true,
        name: true,
        slug: true,
        templeId: true,
        description: true,
        cities: true,
        languages: true,
        benefits: true,
        purohitCarryItems: true,
        iconUrl: true,
        minPrice: true,
        maxPrice: true,
        // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
        // priceWithoutSamagri: true,
        // priceWithSamagri: true,
        plans: true,
        tokenPercentage: true,
        commissionPercentage: true,
        durationMinutes: true,
        requiresVenue: true,
        isActive: true,
        isGlobal: true,
        isOnline: true,
        isOffline: true,
        isUpcomingFestival: true,
        festivalStartDate: true,
        festivalEndDate: true,
        createdAt: true,
        updatedAt: true,
        sortOrder: true,
        temple: {
          id: true,
          name: true,
        },
      },
    });

    // TODO: Previous findById with only totalBookings kept for reference:
    /*
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
    */

    if (service) {
      const bookingCount = await this.repo.manager
        .createQueryBuilder(Booking, 'booking')
        .where('booking.serviceId = :id', { id })
        .andWhere('booking.deletedAt IS NULL')
        .getCount();

      const purohitCount = await this.repo.manager
        .createQueryBuilder(PurohitService, 'ps')
        .select(
          'COUNT(DISTINCT CASE WHEN ps.isOnline = true AND (ps.isActive = true OR ps.isActive IS NULL) THEN ps.purohitId END)',
          'onlineCount',
        )
        .addSelect(
          'COUNT(DISTINCT CASE WHEN ps.isOffline = true AND (ps.isActive = true OR ps.isActive IS NULL) THEN ps.purohitId END)',
          'offlineCount',
        )
        .where('ps.serviceId = :id', { id })
        .andWhere('ps.deletedAt IS NULL')
        .getRawOne();

      const onlineCount = parseInt(String(purohitCount?.onlineCount || '0'), 10) || 0;
      const offlineCount = parseInt(String(purohitCount?.offlineCount || '0'), 10) || 0;

      return {
        ...service,
        slug: service.slug ?? null,
        templeId: service.templeId ?? null,
        temple: service.temple ? { id: service.temple.id, name: service.temple.name } : null,
        cities: service.cities ?? [],
        languages: service.languages ?? [],
        benefits: service.benefits ?? [],
        purohitCarryItems: service.purohitCarryItems ?? [],
        totalBookings: bookingCount,
        onlinepurohitCount: onlineCount,
        offlinepurohitCount: offlineCount,
      };
    }

    // TODO: Old return without totalBookings from booking table:
    // return service;

    // TODO: Dead code — service is always returned early above when truthy.
    // Kept for reference, removed to fix TypeScript 'never' narrowing error.
    /*
    if (service) {
      service.cities = service.cities ?? [];
      service.languages = service.languages ?? [];
      service.benefits = service.benefits ?? [];
    }

    return service;
    */

    return null;
  }

  async hasBookingsOrPayments(serviceId: number): Promise<{ hasBookings: boolean; hasPayments: boolean }> {
    const bookingCount = await this.repo.manager
      .createQueryBuilder(Booking, 'booking')
      .withDeleted()
      .where('booking.serviceId = :serviceId', { serviceId })
      .getCount();

    let paymentCount = 0;
    if (bookingCount > 0) {
      paymentCount = await this.repo.manager
        .createQueryBuilder(Payment, 'payment')
        .innerJoin('payment.booking', 'booking')
        .where('booking.serviceId = :serviceId', { serviceId })
        .getCount();
    }

    return {
      hasBookings: bookingCount > 0,
      hasPayments: paymentCount > 0,
    };
  }

  async softRemove(service: Service): Promise<Service> {
    return this.repo.softRemove(service);
  }

  async remove(service: Service): Promise<Service> {
    return this.repo.remove(service);
  }

  async getMaxSortOrder(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('service')
      .select('MAX(service.sortOrder)', 'max')
      .where('service.deletedAt IS NULL')
      .getRawOne();
    return result?.max != null ? parseInt(result.max, 10) || 0 : 0;
  }

  async shiftSortOrdersUp(fromOrder: number, toOrder?: number, excludeServiceId?: number): Promise<void> {
    const qb = this.repo
      .createQueryBuilder()
      .update(Service)
      .set({ sortOrder: () => '"sortOrder" + 1' })
      .where('"deletedAt" IS NULL')
      .andWhere('"sortOrder" >= :fromOrder', { fromOrder });

    if (toOrder !== undefined) {
      qb.andWhere('"sortOrder" < :toOrder', { toOrder });
    }
    if (excludeServiceId !== undefined) {
      qb.andWhere('id != :excludeServiceId', { excludeServiceId });
    }
    await qb.execute();
  }

  async shiftSortOrdersDown(fromOrder: number, toOrder: number, excludeServiceId?: number): Promise<void> {
    const qb = this.repo
      .createQueryBuilder()
      .update(Service)
      .set({ sortOrder: () => '"sortOrder" - 1' })
      .where('"deletedAt" IS NULL')
      .andWhere('"sortOrder" > :fromOrder AND "sortOrder" <= :toOrder', {
        fromOrder,
        toOrder,
      });

    if (excludeServiceId !== undefined) {
      qb.andWhere('id != :excludeServiceId', { excludeServiceId });
    }
    await qb.execute();
  }
}
