import {
  CreateServiceDto,
  CreatePurohitServiceDto,
  PurohitServiceItemDto,
  CreateServiceCategoryDto,
  UpdateServiceCategoryDto,
} from '@poojawala/dtos/service/create.service.dto';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';
import {
  UpdateServiceDto,
  UpdatePurohitServiceDto,
} from '@poojawala/dtos/service/update.service.dto';
import {
  ServiceRepository,
  ServiceCategoryRepository,
  PurohitServiceRepository,
  PurohitProfileRepository,
} from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryFailedError, ILike } from 'typeorm';
import { USER_ROLE, AUDIT_MODULE, ACTOR_TYPE, PUROHIT_VERIFICATION_STATUS, ServicePlans, ServicePlanDetails } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';

// 177 87

@Injectable()
export class ServiceService {
  constructor(
    private readonly serviceRepository: ServiceRepository,
    private readonly categoryRepository: ServiceCategoryRepository,
    private readonly s3Service: S3Service,
    private readonly PurohitServiceRepository: PurohitServiceRepository,
    private readonly PurohitProfileRepository: PurohitProfileRepository,
    private readonly auditLogService: AuditLogService,
  ) { }

  async findAllServices(query: GetServicesQueryDto) {
    const result = await this.serviceRepository.findAllServices(query);

    const dataWithUrls = await Promise.all(
      result.data.map(async (service: any) => {
        let iconDownloadurl: string | null = null;
        if (service.iconUrl) {
          try {
            iconDownloadurl = await this.s3Service.getDownloadUrl(
              service.iconUrl,
            );
          } catch (e) {
            console.error('Failed to generate pre-signed URL for icon:', e);
          }
        }

        (service as any).iconDownloadurl = iconDownloadurl;
        (service as any).purohitPayoutAmount = this.computePurohitPayoutAmount(service);
        this.enrichServicePlansAndToken(service);
        return service;
      }),
    );

    return {
      success: true,
      message: 'Services fetched successfully',
      data: dataWithUrls,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  private validatePlanItem(
    planKey: 'basic' | 'standard',
    plan: unknown,
    isUpdate = false,
  ): ServicePlanDetails {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      throw new BadRequestException(`${planKey} plan must be a valid object`);
    }
    const record = plan as Record<string, unknown>;

    if (!isUpdate || record['price'] !== undefined) {
      const rawPrice = record['price'];
      if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
        throw new BadRequestException(`${planKey} plan price is required`);
      }
      const price = Number(rawPrice);
      if (!Number.isFinite(price) || Number.isNaN(price) || price <= 0) {
        throw new BadRequestException(
          `${planKey} plan price must be a finite positive number greater than 0`,
        );
      }
      const parts = price.toString().split('.');
      if (parts.length > 1 && parts[1].length > 2) {
        throw new BadRequestException(
          `${planKey} plan price must have at most 2 decimal places`,
        );
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        typeof value === 'undefined'
      ) {
        throw new BadRequestException(
          `Feature "${key}" in ${planKey} plan contains an unsupported non-JSON value`,
        );
      }
    }

    return record as ServicePlanDetails;
  }

  private computePurohitPayoutAmount(service: any): number | null {
    if (!service) return null;
    let plans = service.plans;
    if (typeof plans === 'string') {
      try {
        plans = JSON.parse(plans);
      } catch {}
    }

    let basePrice = 0;
    if (plans?.basic?.price != null && Number(plans.basic.price) > 0) {
      basePrice = Number(plans.basic.price);
    } else if (
      service.priceWithoutSamagri != null &&
      Number(service.priceWithoutSamagri) > 0
    ) {
      basePrice = Number(service.priceWithoutSamagri);
    }

    if (basePrice <= 0) return null;

    const commissionPercentage = Number(
      service.commissionPercentage != null ? service.commissionPercentage : 10,
    );
    const platformCommission = Number(
      ((basePrice * commissionPercentage) / 100).toFixed(2),
    );
    return Number((basePrice - platformCommission).toFixed(2));
  }

  private enrichServicePlansAndToken(service: any) {
    if (!service) return service;

    const effectiveTokenPercentage =
      service.tokenPercentage != null && Number(service.tokenPercentage) > 0
        ? Number(service.tokenPercentage)
        : 30;

    let plans = service.plans;
    if (typeof plans === 'string') {
      try {
        plans = JSON.parse(plans);
      } catch {}
    }

    if (plans && typeof plans === 'object' && !Array.isArray(plans)) {
      const enrichedPlans: Record<string, any> = { ...plans };

      for (const [key, plan] of Object.entries(plans)) {
        if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
          const planRecord = { ...(plan as any) };
          if (
            planRecord.price != null &&
            !isNaN(Number(planRecord.price)) &&
            Number(planRecord.price) > 0
          ) {
            const planPrice = Number(planRecord.price);
            const tokenAmount = Number(
              ((planPrice * effectiveTokenPercentage) / 100).toFixed(2),
            );
            planRecord.tokenAmount = tokenAmount;
          }
          enrichedPlans[key] = planRecord;
        }
      }

      service.plans = enrichedPlans;
    }

    return service;
  }

  private enrichPurohitServiceWithPayout(purohitService: any, serviceEntity?: any) {
    if (!purohitService) return purohitService;
    const service = serviceEntity || purohitService.service;
    const payoutAmount = this.computePurohitPayoutAmount(service);

    purohitService.purohitPayoutAmount = payoutAmount;
    if (service) {
      service.purohitPayoutAmount = payoutAmount;
      this.enrichServicePlansAndToken(service);
    }
    return purohitService;
  }

  private validatePlans(plans: unknown): ServicePlans {
    if (!plans || typeof plans !== 'object' || Array.isArray(plans)) {
      throw new BadRequestException(
        'plans must be an object containing basic and standard plans',
      );
    }

    const allowedKeys = ['basic', 'standard'];
    const keys = Object.keys(plans);
    for (const key of keys) {
      if (!allowedKeys.includes(key)) {
        throw new BadRequestException(
          `Invalid plan key "${key}". Only "basic" and "standard" are allowed`,
        );
      }
    }

    const plansObj = plans as Record<string, unknown>;
    if (!plansObj['basic']) {
      throw new BadRequestException('basic plan is required');
    }
    if (!plansObj['standard']) {
      throw new BadRequestException('standard plan is required');
    }

    const basic = this.validatePlanItem('basic', plansObj['basic'], false);
    const standard = this.validatePlanItem('standard', plansObj['standard'], false);

    return { basic, standard };
  }

  async createService(
    dto: CreateServiceDto,
    files: {
      icon?: Express.Multer.File[];
    },
    adminId: number,
  ) {
    try {
      const existing = await this.serviceRepository.findOne({
        where: [{ name: dto.name }, { slug: dto.slug }],
      });

      if (existing) {
        throw new ConflictException(
          'Service with same name or slug already exists',
        );
      }

      if (!dto.plans) {
        throw new BadRequestException(
          'plans must be an object containing basic and standard plans',
        );
      }
      const resolvedPlans = this.validatePlans(dto.plans);

      // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
      /*
      if (
        dto.priceWithoutSamagri != null ||
        dto.priceWithSamagri != null
      ) {
        if (
          dto.priceWithoutSamagri == null ||
          !Number.isFinite(Number(dto.priceWithoutSamagri)) ||
          Number(dto.priceWithoutSamagri) <= 0
        ) {
          throw new BadRequestException(
            'A valid price without samagri (minimum ₹1) is required',
          );
        }
        if (
          dto.priceWithSamagri == null ||
          !Number.isFinite(Number(dto.priceWithSamagri)) ||
          Number(dto.priceWithSamagri) <= 0
        ) {
          throw new BadRequestException(
            'A valid price with samagri (minimum ₹1) is required',
          );
        }
        resolvedPlans = {
          basic: { price: Number(dto.priceWithoutSamagri) },
          standard: { price: Number(dto.priceWithSamagri) },
        };
      }
      */

      if (dto.tokenPercentage !== undefined && dto.tokenPercentage !== null) {
        const tp = Number(dto.tokenPercentage);
        if (!Number.isFinite(tp) || tp < 1 || tp > 100) {
          throw new BadRequestException('Token percentage must be a valid number between 1 and 100');
        }
      }

      // TODO: Legacy minPrice/maxPrice pricing logic.
      // Kept for backward compatibility if legacy callers provide both minPrice and maxPrice.
      if (dto.minPrice !== undefined && dto.maxPrice !== undefined) {
        if (dto.minPrice > dto.maxPrice) {
          throw new BadRequestException(
            'Minimum price cannot be greater than maximum price',
          );
        }
      }

      let iconUrl: string | undefined;

      if (files?.icon?.length) {
        iconUrl = await this.s3Service.uploadFileHelper(
          dto.slug,
          'icon',
          files.icon,
        );
      }

      if (dto.isUpcomingFestival) {
        if (!dto.festivalStartDate || !dto.festivalEndDate) {
          throw new BadRequestException('Festival start and end dates are required.');
        }
        if (new Date(dto.festivalStartDate) >= new Date(dto.festivalEndDate)) {
          throw new BadRequestException('Festival end date must be after the start date.');
        }
      }

      const resolvedCities = dto.cities ?? [];
      // isGlobal is always auto-derived: true when no cities, false when city-specific
      const resolvedIsGlobal = resolvedCities.length === 0;

      const service = this.serviceRepository.create({
        ...dto,
        cities: resolvedCities,
        languages: dto.languages ?? [],
        benefits: dto.benefits ?? [],
        plans: resolvedPlans,
        // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
        // priceWithoutSamagri: resolvedPlans.basic.price,
        // priceWithSamagri: resolvedPlans.standard.price,
        tokenPercentage: dto.tokenPercentage != null ? Number(dto.tokenPercentage) : 30,
        iconUrl,
        isActive: dto.isActive ?? true,
        isGlobal: resolvedIsGlobal,
        isUpcomingFestival: dto.isUpcomingFestival ?? false,
      });

      const savedService = await this.serviceRepository.save(service);

      if (savedService.iconUrl) {
        try {
          savedService.iconUrl = await this.s3Service.getDownloadUrl(
            savedService.iconUrl,
          );
        } catch (e) {
          console.error('Failed to generate signed URL:', e);
        }
      }

      await this.auditLogService.createAuditLog({
        actorId: adminId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.SERVICE,
        entity: 'Service',
        entityId: String(savedService.id),
        action: 'SERVICE_CREATED',
        message: `Admin created new service ${savedService.name}.`,
        oldValue: undefined,
        newValue: { name: savedService.name, slug: savedService.slug },
      });

      (savedService as any).purohitPayoutAmount = this.computePurohitPayoutAmount(savedService);
      this.enrichServicePlansAndToken(savedService);

      return {
        success: true,
        message: 'Service created successfully',
        data: savedService,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error in createService:', error);
      const errorMsg =
        error instanceof Error ? error.stack : JSON.stringify(error);
      throw new InternalServerErrorException(
        `createService failed: ${errorMsg}`,
      );
    }
  }

  async updateService(
    id: number,
    dto: UpdateServiceDto,
    files: {
      icon?: Express.Multer.File[];
    },
    adminId: number,
  ) {
    const service = await this.serviceRepository.findOne({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (dto.name) {
      const existingName = await this.serviceRepository.findOne({
        where: { name: dto.name },
      });

      if (existingName && existingName.id !== id) {
        throw new ConflictException('Service with same name already exists');
      }
    }

    if (dto.slug) {
      const existingSlug = await this.serviceRepository.findOne({
        where: { slug: dto.slug },
      });

      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException('Service with same slug already exists');
      }
    }

    // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
    /*
    if (dto.priceWithoutSamagri !== undefined) {
      if (
        dto.priceWithoutSamagri === null ||
        !Number.isFinite(Number(dto.priceWithoutSamagri)) ||
        Number(dto.priceWithoutSamagri) < 1
      ) {
        throw new BadRequestException('Price without samagri must be a valid number greater than or equal to 1');
      }
    }

    if (dto.priceWithSamagri !== undefined) {
      if (
        dto.priceWithSamagri === null ||
        !Number.isFinite(Number(dto.priceWithSamagri)) ||
        Number(dto.priceWithSamagri) < 1
      ) {
        throw new BadRequestException('Price with samagri must be a valid number greater than or equal to 1');
      }
    }
    */

    // TODO: Legacy minPrice/maxPrice check.
    // Retained for backward compatibility when updating legacy price fields.
    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      const minPrice = dto.minPrice ?? Number(service.minPrice);
      const maxPrice = dto.maxPrice ?? Number(service.maxPrice);

      if (Number.isFinite(minPrice) && Number.isFinite(maxPrice) && minPrice > maxPrice) {
        throw new BadRequestException(
          'Minimum price cannot be greater than maximum price',
        );
      }
    }

    // TODO: Previous Object.assign(service, dto) kept for reference:
    /*
    Object.assign(service, dto);
    */
    const oldCities = service.cities;
    const oldLanguages = service.languages;
    const oldBenefits = service.benefits;
    // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
    // const oldPriceWithoutSamagri = service.priceWithoutSamagri;
    // const oldPriceWithSamagri = service.priceWithSamagri;
    const oldTokenPercentage = service.tokenPercentage;
    const oldPlans = service.plans;

    if (dto.tokenPercentage !== undefined) {
      if (dto.tokenPercentage !== null) {
        const tp = Number(dto.tokenPercentage);
        if (!Number.isFinite(tp) || tp < 1 || tp > 100) {
          throw new BadRequestException('Token percentage must be a valid number between 1 and 100');
        }
        service.tokenPercentage = tp;
      } else {
        service.tokenPercentage = 30;
      }
    }

    let mergedPlans: ServicePlans | undefined = undefined;
    if (dto.plans !== undefined) {
      if (!dto.plans || typeof dto.plans !== 'object' || Array.isArray(dto.plans)) {
        throw new BadRequestException('plans must be a valid object');
      }

      const allowedKeys = ['basic', 'standard'];
      const planKeys = Object.keys(dto.plans);
      for (const key of planKeys) {
        if (!allowedKeys.includes(key)) {
          throw new BadRequestException(
            `Invalid plan key "${key}". Only "basic" and "standard" are allowed`,
          );
        }
      }

      const currentPlans: ServicePlans = service.plans ?? {
        basic: { price: 0 },
        standard: { price: 0 },
      };

      let newBasic: ServicePlanDetails = currentPlans.basic
        ? { ...currentPlans.basic }
        : { price: 0 };
      let newStandard: ServicePlanDetails = currentPlans.standard
        ? { ...currentPlans.standard }
        : { price: 0 };

      if (dto.plans.basic !== undefined) {
        const validatedBasic = this.validatePlanItem('basic', dto.plans.basic, true);
        const resolvedPrice =
          validatedBasic.price !== undefined
            ? Number(validatedBasic.price)
            : (currentPlans.basic?.price ?? 0);

        // Filter out any keys explicitly set to null/undefined or replace with new plan features
        const cleanBasicFeatures: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(validatedBasic)) {
          if (val !== null && val !== undefined) {
            cleanBasicFeatures[key] = val;
          }
        }

        newBasic = {
          ...cleanBasicFeatures,
          price: resolvedPrice,
        };
      }

      if (dto.plans.standard !== undefined) {
        const validatedStandard = this.validatePlanItem('standard', dto.plans.standard, true);
        const resolvedPrice =
          validatedStandard.price !== undefined
            ? Number(validatedStandard.price)
            : (currentPlans.standard?.price ?? 0);

        // Filter out any keys explicitly set to null/undefined or replace with new plan features
        const cleanStandardFeatures: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(validatedStandard)) {
          if (val !== null && val !== undefined) {
            cleanStandardFeatures[key] = val;
          }
        }

        newStandard = {
          ...cleanStandardFeatures,
          price: resolvedPrice,
        };
      }

      mergedPlans = {
        basic: newBasic,
        standard: newStandard,
      };
    }

    Object.assign(service, dto);

    // Safeguard plans and pricing fields against unintentional overwrites
    if (mergedPlans !== undefined) {
      service.plans = mergedPlans;
    } else {
      service.plans = oldPlans;
    }

    // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
    /*
    if (dto.priceWithoutSamagri === undefined && !mergedPlans?.basic?.price) {
      service.priceWithoutSamagri = oldPriceWithoutSamagri;
    }
    if (dto.priceWithSamagri === undefined && !mergedPlans?.standard?.price) {
      service.priceWithSamagri = oldPriceWithSamagri;
    }
    */
    if (dto.tokenPercentage === undefined) {
      service.tokenPercentage = oldTokenPercentage;
    }

    if (dto.cities !== undefined) {
      service.cities = dto.cities ?? [];
    }
    if (dto.languages !== undefined) {
      service.languages = dto.languages ?? [];
    }
    if (dto.benefits !== undefined) {
      service.benefits = dto.benefits ?? [];
    }

    // isGlobal is always auto-derived from the current cities array (never from admin input)
    // This also handles: admin removes all cities → isGlobal becomes true automatically
    service.isGlobal = !service.cities || service.cities.length === 0;

    if (service.isUpcomingFestival) {
      if (!service.festivalStartDate || !service.festivalEndDate) {
        throw new BadRequestException('Festival start and end dates are required.');
      }
      if (new Date(service.festivalStartDate) >= new Date(service.festivalEndDate)) {
        throw new BadRequestException('Festival end date must be after the start date.');
      }
    } else {
      service.festivalStartDate = null;
      service.festivalEndDate = null;
    }

    // Upload new icon if provided
    if (files?.icon?.length) {
      service.iconUrl = await this.s3Service.uploadFileHelper(
        service.slug,
        'icon',
        files.icon,
      );
    }

    const updated = await this.serviceRepository.save(service);

    const updatedFields: Record<string, unknown> = { name: updated.name };
    if (dto.cities !== undefined) updatedFields.cities = updated.cities;
    if (dto.languages !== undefined) updatedFields.languages = updated.languages;
    if (dto.benefits !== undefined) updatedFields.benefits = updated.benefits;
    if (dto.plans !== undefined) updatedFields.plans = updated.plans;

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'Service',
      entityId: String(updated.id),
      action: 'SERVICE_UPDATED',
      message: `Admin updated service ${updated.name}.`,
      oldValue: {
        cities: oldCities,
        languages: oldLanguages,
        benefits: oldBenefits,
        plans: oldPlans,
      },
      newValue: updatedFields,
    });

    (updated as any).purohitPayoutAmount = this.computePurohitPayoutAmount(updated);
    this.enrichServicePlansAndToken(updated);

    return {
      success: true,
      message: 'Service updated successfully',
      data: updated,
    };
  }

  async findServiceById(id: number) {
    const service = await this.serviceRepository.findById(id);

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    let iconDownloadurl: string | null = null;
    if (service.iconUrl) {
      try {
        iconDownloadurl = await this.s3Service.getDownloadUrl(service.iconUrl);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for icon:', e);
      }
    }
    (service as any).iconDownloadurl = iconDownloadurl;
    (service as any).purohitPayoutAmount = this.computePurohitPayoutAmount(service);
    this.enrichServicePlansAndToken(service);

    return {
      success: true,
      message: 'Service fetched successfully',
      data: service,
    };
  }

  async deleteService(id: number, adminId: number) {
    const service = await this.serviceRepository.findOne({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    try {
      await this.serviceRepository.remove(service);

      await this.auditLogService.createAuditLog({
        actorId: adminId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.SERVICE,
        entity: 'Service',
        entityId: String(id),
        action: 'SERVICE_DELETED',
        message: `Admin deleted service ${service.name}.`,
        oldValue: undefined,
        newValue: { deleted: true },
      });

      return {
        success: true,
        message: 'Service deleted successfully',
      };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.driverError?.code === '23503'
      ) {
        throw new BadRequestException(
          'Service cannot be deleted because it is associated with other records.',
        );
      }

      throw new InternalServerErrorException(
        'Something went wrong while deleting the service.',
      );
    }
  }

  async updateServiceStatus(id: number, isActive: boolean, adminId: number) {
    const service = await this.serviceRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const oldStatus = service.isActive;
    service.isActive = isActive;
    const updatedService = await this.serviceRepository.save(service);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'Service',
      entityId: String(id),
      action: 'SERVICE_STATUS_UPDATED',
      message: `Admin updated service #${id} (${service.name}) status to ${isActive}.`,
      oldValue: { isActive: oldStatus },
      newValue: { isActive },
    });

    return {
      success: true,
      message: 'Service status updated successfully',
      data: updatedService,
    };
  }

  async addService(dto: CreatePurohitServiceDto, userId: number) {
    const purohitProfile = await this.PurohitProfileRepository.findOne({
      where: { userId },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (
      purohitProfile.verificationStatus !== PUROHIT_VERIFICATION_STATUS.APPROVED
    ) {
      throw new ForbiddenException(
        'You cannot access this functionality until Administration verifies your Purohit profile.',
      );
    }

    const added: any[] = [];
    const failed: any[] = [];

    for (const item of dto.services) {
      // Validate each item

      const serviceDto = new PurohitServiceItemDto();

      serviceDto.serviceId = Number(item.serviceId);
      // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans. Payout is calculated from service.plans.basic.price.
      // serviceDto.isOnline = Boolean(item.isOnline);
      // serviceDto.isOffline = Boolean(item.isOffline);
      // serviceDto.onlinePrice = item.onlinePrice ? Number(item.onlinePrice) : undefined;
      // serviceDto.offlinePrice = item.offlinePrice ? Number(item.offlinePrice) : undefined;
      serviceDto.durationMinutes = item.durationMinutes
        ? Number(item.durationMinutes)
        : undefined;
      serviceDto.isActive = item.isActive;

      const errors = await validate(serviceDto);

      if (errors.length > 0) {
        failed.push({
          serviceId: item.serviceId,
          reason: errors.flatMap((error) =>
            Object.values(error.constraints ?? {}),
          ),
        });
        continue;
      }

      // Check if master service exists
      const service = await this.serviceRepository.findOne({
        where: { id: serviceDto.serviceId },
      });

      if (!service) {
        failed.push({
          serviceId: serviceDto.serviceId,
          reason: ['Service not found'],
        });
        continue;
      }

      // Check duplicate (including soft-deleted records)
      const existing = await this.PurohitServiceRepository.findOne({
        where: {
          purohitId: purohitProfile.id,
          serviceId: serviceDto.serviceId,
        },
        withDeleted: true,
      });

      if (existing) {
        if (!existing.deletedAt) {
          failed.push({
            serviceId: serviceDto.serviceId,
            reason: ['Service already added'],
          });
          continue;
        }

        // Service was previously soft-deleted: restore and update with new settings
        await this.PurohitServiceRepository.restore(existing.id);
        await this.PurohitServiceRepository.update(existing.id, {
          deletedAt: null as any,
          // TODO: Deprecated with fixed service pricing. Purohit no longer configures price or online/offline modes.
          // isOnline: serviceDto.isOnline ?? existing.isOnline,
          // isOffline: serviceDto.isOffline ?? existing.isOffline,
          // onlinePrice: serviceDto.onlinePrice ?? existing.onlinePrice,
          // offlinePrice: serviceDto.offlinePrice ?? existing.offlinePrice,
          durationMinutes: serviceDto.durationMinutes ?? existing.durationMinutes,
          isActive: serviceDto.isActive ?? true,
        });

        const restored = await this.PurohitServiceRepository.findById(existing.id);
        if (restored) added.push(restored);
        continue;
      }

      // Save new
      const entity = this.PurohitServiceRepository.create({
        ...serviceDto,
        purohitId: purohitProfile.id,
      });

      try {
        const saved = await this.PurohitServiceRepository.save(entity);
        (saved as any).service = service;
        this.enrichPurohitServiceWithPayout(saved, service);
        added.push(saved);
      } catch (err: any) {
        if (
          err.code === '23505' ||
          err.message?.includes('duplicate key') ||
          err.message?.includes('unique constraint')
        ) {
          const softDeleted = await this.PurohitServiceRepository.findOne({
            where: {
              purohitId: purohitProfile.id,
              serviceId: serviceDto.serviceId,
            },
            withDeleted: true,
          });
          if (softDeleted) {
            await this.PurohitServiceRepository.restore(softDeleted.id);
            await this.PurohitServiceRepository.update(softDeleted.id, {
              deletedAt: null as any,
              // TODO: Deprecated with fixed service pricing. Purohit no longer configures price or online/offline modes.
              // isOnline: serviceDto.isOnline ?? softDeleted.isOnline,
              // isOffline: serviceDto.isOffline ?? softDeleted.isOffline,
              // onlinePrice: serviceDto.onlinePrice ?? softDeleted.onlinePrice,
              // offlinePrice: serviceDto.offlinePrice ?? softDeleted.offlinePrice,
              durationMinutes: serviceDto.durationMinutes ?? softDeleted.durationMinutes,
              isActive: serviceDto.isActive ?? true,
            });
            const restored = await this.PurohitServiceRepository.findById(softDeleted.id);
            if (restored) {
              (restored as any).service = service;
              this.enrichPurohitServiceWithPayout(restored, service);
              added.push(restored);
            }
            continue;
          }
        }
        throw err;
      }
    }

    return {
      success: added.length > 0,
      message: `${added.length} service(s) added, ${failed.length} failed.`,
      data: {
        added,
        failed,
      },
    };
  }

  async getPurohitServices(userId: number, query: GetServicesQueryDto) {
    const purohitProfile = await this.PurohitProfileRepository.findOne({
      where: { userId: userId },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      purohitId: purohitProfile.id,
    };

    if (search) {
      whereCondition.service = { name: ILike(`%${search}%`) };
    }

    const [data, total] = await this.PurohitServiceRepository.findAndCount({
      where: whereCondition,
      relations: ['service'], // Assuming you have a relation to the Service entity
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const dataWithUrls = await Promise.all(
      data.map(async (purohitService: any) => {
        if (purohitService.service?.iconUrl) {
          try {
            purohitService.service.iconDownloadurl = await this.s3Service.getDownloadUrl(
              purohitService.service.iconUrl,
            );
          } catch (e) {
            console.error('Failed to generate pre-signed URL for icon:', e);
          }
        }
        // Service Plan Pricing: Purohit's payout is calculated based on service.plans.basic.price
        this.enrichPurohitServiceWithPayout(purohitService);
        return purohitService;
      }),
    );

    return {
      success: true,
      message: 'Purohit services fetched successfully',
      data: dataWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deletePurohitService(Id: number, userId: number) {
    const purohitService = await this.PurohitServiceRepository.findOne({
      where: { id: Id },
    });

    if (!purohitService) {
      throw new NotFoundException('Purohit service not found');
    }

    const purohitProfile = await this.PurohitProfileRepository.findOne({
      where: { userId: userId },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (purohitService.purohitId !== purohitProfile.id) {
      throw new ForbiddenException(
        'You are not authorized to delete this service',
      );
    }

    await this.PurohitServiceRepository.softDelete(Id);

    return {
      success: true,
      message: 'Purohit service deleted successfully',
    };
  }

  async updatePurohitService(
    Id: number,
    dto: UpdatePurohitServiceDto,
    userId: number,
  ) {
    const purohitService = await this.PurohitServiceRepository.findOne({
      where: { id: Id },
      relations: ['service'],
    });

    if (!purohitService) {
      throw new NotFoundException('Purohit service not found');
    }

    const purohitProfile = await this.PurohitProfileRepository.findOne({
      where: { userId: userId },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (purohitService.purohitId !== purohitProfile.id) {
      throw new ForbiddenException(
        'You are not authorized to update this service',
      );
    }

    // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
    // Price and payout are fixed based on master service plans (plans.basic.price).
    if (dto.durationMinutes !== undefined) {
      purohitService.durationMinutes = dto.durationMinutes;
    }
    if (dto.isActive !== undefined) {
      purohitService.isActive = dto.isActive;
    }
    // Object.assign(purohitService, dto);

    const updatedService =
      await this.PurohitServiceRepository.save(purohitService);

    if (!updatedService.service && purohitService.service) {
      updatedService.service = purohitService.service;
    }
    this.enrichPurohitServiceWithPayout(updatedService);

    return {
      success: true,
      message: 'Purohit service updated successfully',
      data: updatedService,
    };
  }

  async getPurohitServiceById(id: number, userId: number) {
    const purohitProfile = await this.PurohitProfileRepository.findOne({
      where: { userId },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    const purohitService = await this.PurohitServiceRepository.findOne({
      where: {
        id,
        purohitId: purohitProfile.id,
      },
      relations: ['service'],
    });

    if (!purohitService) {
      throw new NotFoundException('Purohit service not found');
    }

    if (purohitService.service?.iconUrl) {
      try {
        (purohitService.service as any).iconDownloadurl = await this.s3Service.getDownloadUrl(
          purohitService.service.iconUrl,
        );
      } catch (e) {
        console.error('Failed to generate pre-signed URL for icon:', e);
      }
    }

    this.enrichPurohitServiceWithPayout(purohitService);

    return {
      success: true,
      message: 'Purohit service fetched successfully',
      data: purohitService,
    };
  }

  // ─── Service Categories ────────────────────────────────────────────────────

  async findAllCategories(query: GetServicesQueryDto) {
    const result = await this.categoryRepository.findAllCategories(query);

    const dataWithUrls = await Promise.all(
      result.data.map(async (cat: any) => {
        let iconDownloadurl: string | null = null;
        if (cat.iconUrl) {
          try {
            iconDownloadurl = await this.s3Service.getDownloadUrl(cat.iconUrl);
          } catch (e) {
            console.error('Failed to generate pre-signed URL for category icon:', e);
          }
        }
        return { ...cat, iconDownloadurl };
      }),
    );

    return {
      success: true,
      message: 'Service categories fetched successfully',
      data: dataWithUrls,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async findCategoryById(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Service category with id ${id} not found`);
    }

    let iconDownloadurl: string | null = null;
    if (category.iconUrl) {
      try {
        iconDownloadurl = await this.s3Service.getDownloadUrl(category.iconUrl);
      } catch (e) {
        console.error('Failed to generate pre-signed URL for category icon:', e);
      }
    }

    return {
      success: true,
      message: 'Service category fetched successfully',
      data: { ...category, iconDownloadurl },
    };
  }

  async createCategory(
    dto: CreateServiceCategoryDto,
    files: { icon?: Express.Multer.File[] },
    adminId: number,
  ) {
    const existing = await this.categoryRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(
        `A service category with name "${dto.name}" already exists`,
      );
    }

    let iconKey: string | undefined = undefined;
    if (files?.icon?.length) {
      iconKey = await this.s3Service.uploadFileHelper(
        `service-categories`,
        'icon',
        files.icon,
      );
    }

    const category = this.categoryRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim(),
      iconUrl: iconKey ?? dto.iconUrl,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    const saved = await this.categoryRepository.save(category);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'ServiceCategory',
      entityId: String(saved.id),
      action: 'CATEGORY_CREATED',
      message: `Admin created service category "${saved.name}"`,
      newValue: { id: saved.id, name: saved.name },
    });

    return {
      success: true,
      message: 'Service category created successfully',
      data: saved,
    };
  }

  async updateCategory(
    id: number,
    dto: UpdateServiceCategoryDto,
    files: { icon?: Express.Multer.File[] },
    adminId: number,
  ) {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Service category with id ${id} not found`);
    }

    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoryRepository.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `A service category with name "${dto.name}" already exists`,
        );
      }
    }

    const oldSnapshot = { name: category.name, isActive: category.isActive, sortOrder: category.sortOrder };

    if (files?.icon?.length) {
      category.iconUrl = await this.s3Service.uploadFileHelper(
        `service-categories`,
        'icon',
        files.icon,
      );
    } else if (dto.iconUrl !== undefined) {
      category.iconUrl = dto.iconUrl;
    }

    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.description !== undefined) category.description = dto.description?.trim();
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    const updated = await this.categoryRepository.save(category);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'ServiceCategory',
      entityId: String(id),
      action: 'CATEGORY_UPDATED',
      message: `Admin updated service category id ${id}`,
      oldValue: oldSnapshot,
      newValue: { name: updated.name, isActive: updated.isActive, sortOrder: updated.sortOrder },
    });

    return {
      success: true,
      message: 'Service category updated successfully',
      data: updated,
    };
  }

  async deleteCategory(id: number, adminId: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Service category with id ${id} not found`);
    }

    await this.categoryRepository.softDelete(id);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'ServiceCategory',
      entityId: String(id),
      action: 'CATEGORY_DELETED',
      message: `Admin soft-deleted service category "${category.name}" (id: ${id})`,
      oldValue: { name: category.name },
    });

    return {
      success: true,
      message: 'Service category deleted successfully',
    };
  }
}

