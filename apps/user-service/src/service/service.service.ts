import {
  CreateServiceDto,
  CreatePurohitServiceDto,
  PurohitServiceItemDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '@poojawala/dtos/service/create.service.dto';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';
import {
  UpdateServiceDto,
  UpdatePurohitServiceDto,
} from '@poojawala/dtos/service/update.service.dto';
import {
  ServiceRepository,
  CategoryRepository,
  PurohitServiceRepository,
  PurohitProfileRepository,
  TempleRepository,
  ServiceFeatureRepository,
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
  Optional,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryFailedError, ILike } from 'typeorm';
import {
  USER_ROLE,
  AUDIT_MODULE,
  ACTOR_TYPE,
  PUROHIT_VERIFICATION_STATUS,
  Service,
  ServicePlans,
  ServicePlanDetails,
  NOTIFICATION_TYPE,
  ServiceCity,
  CATEGORY_TYPE,
  Temple,
  SERVICE_FEATURE_PLAN,
  SERVICE_FEATURE_TYPE,
} from '@poojawala/entities';
import { AuditLogService, generateUniqueSlug } from '@poojawala/common';
import { NotificationService } from '@poojawala/notification';
import { EmailService } from '@poojawala/email-services';

function sanitizeServiceCities(rawList: any): ServiceCity[] {
  if (!rawList) return [];
  const list = Array.isArray(rawList) ? rawList : [rawList];
  const result: ServiceCity[] = [];
  for (const c of list) {
    if (!c) continue;
    const name = typeof c === 'string' ? c.trim() : String(c.name || c.cityName || '').trim();
    if (!name) continue;
    const state = c && typeof c === 'object' && c.state ? String(c.state).trim() : undefined;
    result.push({ name, ...(state ? { state } : {}) });
  }
  return result;
}

// 177 87

@Injectable()
export class ServiceService {
  constructor(
    private readonly serviceRepository: ServiceRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly s3Service: S3Service,
    private readonly PurohitServiceRepository: PurohitServiceRepository,
    private readonly PurohitProfileRepository: PurohitProfileRepository,
    private readonly auditLogService: AuditLogService,
    private readonly templeRepository: TempleRepository,
    private readonly serviceFeatureRepository: ServiceFeatureRepository,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly emailService?: EmailService,
  ) { }

  async findAllServices(query: GetServicesQueryDto, isAdmin: boolean = false) {
    if (query.templeId !== undefined && query.templeId !== null && String(query.templeId).trim() !== '') {
      const strVal = String(query.templeId).trim();
      if (strVal.toLowerCase() !== 'all' && strVal.toLowerCase() !== 'null') {
        const tid = Number(strVal);
        if (!isNaN(tid)) {
          await this.validateTempleForPublicAccess(tid);
        }
      }
    }

    const result = await this.serviceRepository.findAllServices(query, isAdmin);

    const serviceIds = (result.data || []).map((s: any) => s.id).filter(Boolean);
    const featuresByServiceId = new Map<number, any[]>();

    if (serviceIds.length > 0 && this.serviceFeatureRepository) {
      try {
        const allFeatures = await this.serviceFeatureRepository.findByServiceIds(serviceIds);

        for (const feat of allFeatures || []) {
          const list = featuresByServiceId.get(feat.serviceId) || [];
          list.push(feat);
          featuresByServiceId.set(feat.serviceId, list);
        }
      } catch (err) {
        console.error('Failed to batch load service features:', err);
      }
    }

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
        (service as any).sortOrder = Number(service.sortOrder ?? 0);
        const serviceFeatures = featuresByServiceId.get(service.id) || [];
        this.enrichServicePlansAndToken(service, serviceFeatures);
        delete (service as any).serviceFeatures;
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

  private async syncServiceFeatures(
    serviceId: number,
    plan: SERVICE_FEATURE_PLAN,
    rawFeatures: any[],
  ) {
    if (!Array.isArray(rawFeatures)) return;

    // Delete existing features for this service and plan
    await this.serviceFeatureRepository.delete({
      serviceId,
      plan,
    } as any);

    if (rawFeatures.length === 0) return;

    const featureEntities = rawFeatures.map((item) => {
      const typeStr = item.type ? String(item.type).trim().toUpperCase() : 'NORMAL';
      const type =
        typeStr === 'PRICE'
          ? SERVICE_FEATURE_TYPE.PRICE
          : SERVICE_FEATURE_TYPE.NORMAL;
      const value =
        item.value !== undefined && item.value !== null
          ? String(item.value)
          : 'true';

      return this.serviceFeatureRepository.create({
        serviceId,
        plan,
        title: item.title ? String(item.title).trim() : '',
        description: item.description ? String(item.description).trim() : null,
        type,
        value,
        isActive: item.isActive !== undefined ? Boolean(item.isActive) : true,
      });
    });

    await this.serviceFeatureRepository.save(featureEntities as any);
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

    // TODO: PLAN_BASED_PUROHIT_PAYOUT
    // Previous top-level payout calculation was based on the basic plan price
    // (or priceWithoutSamagri fallback). Retained for backward compatibility/reference.
    // Plan-specific payout amounts are now exposed inside each plan object
    // via enrichServicePlansAndToken() — e.g. plans.basic.basicPurohitPayoutAmount
    // and plans.standard.standardPurohitPayoutAmount.
    //
    // The top-level purohitPayoutAmount continues to use the basic plan price
    // because service-list and service-detail APIs have no selected-plan context.
    // When a specific plan IS selected (e.g. in a booking), use the plan-specific
    // payout field instead of this top-level value.
    //
    // --- Original implementation (commented, not deleted) ---
    // let plans = service.plans;
    // if (typeof plans === 'string') {
    //   try { plans = JSON.parse(plans); } catch {}
    // }
    // let basePrice = 0;
    // if (plans?.basic?.price != null && Number(plans.basic.price) > 0) {
    //   basePrice = Number(plans.basic.price);
    // } else if (
    //   service.priceWithoutSamagri != null &&
    //   Number(service.priceWithoutSamagri) > 0
    // ) {
    //   basePrice = Number(service.priceWithoutSamagri);
    // }
    // if (basePrice <= 0) return null;
    // const commissionPercentage = Number(
    //   service.commissionPercentage != null ? service.commissionPercentage : 10,
    // );
    // const platformCommission = Number(
    //   ((basePrice * commissionPercentage) / 100).toFixed(2),
    // );
    // return Number((basePrice - platformCommission).toFixed(2));
    // --- End of original implementation ---

    let plans = service.plans;
    if (typeof plans === 'string') {
      try {
        plans = JSON.parse(plans);
      } catch { }
    }

    let basePrice = 0;
    if (plans?.basic?.price != null && Number(plans.basic.price) > 0) {
      basePrice = Number(plans.basic.price);
    } else if (plans?.standard?.price != null && Number(plans.standard.price) > 0) {
      basePrice = Number(plans.standard.price);
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

  private enrichServicePlansAndToken(service: any, serviceFeatures?: any[]) {
    if (!service) return service;

    const effectiveTokenPercentage =
      service.tokenPercentage != null && Number(service.tokenPercentage) > 0
        ? Number(service.tokenPercentage)
        : 30;

    // Commission percentage for purohit payout calculation (defaults to 10 like the entity)
    const effectiveCommissionPercentage =
      service.commissionPercentage != null
        ? Number(service.commissionPercentage)
        : 10;

    let plans = service.plans;
    if (typeof plans === 'string') {
      try {
        plans = JSON.parse(plans);
      } catch { }
    }

    if (plans && typeof plans === 'object' && !Array.isArray(plans)) {
      const enrichedPlans: Record<string, any> = {};
      const allFeatures = Array.isArray(serviceFeatures)
        ? serviceFeatures
        : (Array.isArray(service.serviceFeatures) ? service.serviceFeatures : []);

      for (const [key, plan] of Object.entries(plans)) {
        if (
          (key === 'BASIC' && 'basic' in plans) ||
          (key === 'STANDARD' && 'standard' in plans)
        ) {
          continue;
        }
        const planKey = key.toLowerCase();
        if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
          const rawPlanRecord = { ...(plan as any) };

          // ── Pricing fields at plan root level ──────────────────────────
          const structuredPlan: Record<string, any> = {};

          if (
            rawPlanRecord.price != null &&
            !isNaN(Number(rawPlanRecord.price)) &&
            Number(rawPlanRecord.price) > 0
          ) {
            const planPrice = Number(rawPlanRecord.price);
            structuredPlan.price = planPrice;

            const tokenAmount = Number(
              ((planPrice * effectiveTokenPercentage) / 100).toFixed(2),
            );
            structuredPlan.tokenAmount = tokenAmount;

            // ── Plan-specific Purohit payout calculation ──────────────────
            // Formula: planPrice - (planPrice * commissionPercentage / 100)
            const planPayoutFieldKey = `${key}PurohitPayoutAmount`;
            const platformCommission = Number(
              ((planPrice * effectiveCommissionPercentage) / 100).toFixed(2),
            );
            structuredPlan[planPayoutFieldKey] = Number(
              (planPrice - platformCommission).toFixed(2),
            );
          } else {
            // Preserve price even if invalid (don't lose data)
            if (rawPlanRecord.price != null) {
              structuredPlan.price = rawPlanRecord.price;
            }
          }

          // ── Features for this plan from service_features table ───────
          const pricingKeys = new Set(['price', 'tokenAmount', `${key}PurohitPayoutAmount`]);
          const planDbFeatures = allFeatures.filter(
            (f: any) => String(f.plan).toLowerCase() === key.toLowerCase(),
          );

          if (planDbFeatures.length > 0) {
            structuredPlan.features = planDbFeatures;
          } else if (Array.isArray(rawPlanRecord.features) && rawPlanRecord.features.length > 0) {
            structuredPlan.features = rawPlanRecord.features;
          } else {
            const features: Record<string, any> = {};
            // Unpack nested features or legacy items if already structured
            if (
              rawPlanRecord.features &&
              typeof rawPlanRecord.features === 'object' &&
              !Array.isArray(rawPlanRecord.features)
            ) {
              Object.assign(features, rawPlanRecord.features);
            }
            if (
              rawPlanRecord.items &&
              typeof rawPlanRecord.items === 'object' &&
              !Array.isArray(rawPlanRecord.items)
            ) {
              Object.assign(features, rawPlanRecord.items);
            }
            // Gather any flat feature keys
            for (const [featureKey, featureValue] of Object.entries(rawPlanRecord)) {
              if (
                !pricingKeys.has(featureKey) &&
                featureKey !== 'features' &&
                featureKey !== 'items'
              ) {
                features[featureKey] = featureValue;
              }
            }
            if (Object.keys(features).length > 0) {
              structuredPlan.features = features;
              // Backward compatibility: attach non-enumerable properties so legacy
              // code/tests accessing plan[key] continue to work while JSON output
              // cleanly contains only { price, tokenAmount, payout, features: {...} }
              for (const [featKey, featVal] of Object.entries(features)) {
                if (!(featKey in structuredPlan)) {
                  Object.defineProperty(structuredPlan, featKey, {
                    value: featVal,
                    enumerable: false,
                    writable: true,
                    configurable: true,
                  });
                }
              }
            }
          }

          enrichedPlans[planKey] = structuredPlan;
        }
      }

      service.plans = enrichedPlans;
    }

    return service;
  }

  private enrichPurohitServiceWithPayout(purohitService: any, serviceEntity?: any) {
    if (!purohitService) return purohitService;
    const service = serviceEntity || purohitService.service;
    // TODO: PLAN_BASED_PUROHIT_PAYOUT
    // Top-level purohitPayoutAmount removed from response. Plan-specific payout
    // is now inside each plan object (e.g. plans.basic.basicPurohitPayoutAmount).
    // const payoutAmount = this.computePurohitPayoutAmount(service);
    // purohitService.purohitPayoutAmount = payoutAmount;
    if (service) {
      // TODO: PLAN_BASED_PUROHIT_PAYOUT
      // service.purohitPayoutAmount = payoutAmount;
      this.enrichServicePlansAndToken(service);
    }
    return purohitService;
  }

  private validatePlans(plans: unknown): ServicePlans {
    if (!plans || typeof plans !== 'object' || Array.isArray(plans)) {
      throw new BadRequestException(
        'plans must be an object containing at least one plan (BASIC or STANDARD)',
      );
    }

    const allowedKeys = ['basic', 'standard', 'BASIC', 'STANDARD'];
    const keys = Object.keys(plans);
    for (const key of keys) {
      if (!allowedKeys.includes(key)) {
        throw new BadRequestException(
          `Invalid plan key "${key}". Only "BASIC" and "STANDARD" are allowed`,
        );
      }
    }

    const plansObj = plans as Record<string, unknown>;
    const basicVal = plansObj['basic'] !== undefined ? plansObj['basic'] : plansObj['BASIC'];
    const standardVal = plansObj['standard'] !== undefined ? plansObj['standard'] : plansObj['STANDARD'];

    const hasBasic = basicVal !== undefined && basicVal !== null;
    const hasStandard = standardVal !== undefined && standardVal !== null;

    if (!hasBasic && !hasStandard) {
      throw new BadRequestException(
        'At least one plan (basic or standard) is required',
      );
    }

    const result: ServicePlans = {};
    if (hasBasic) {
      const validatedBasic = this.validatePlanItem('basic', basicVal, false);
      result.basic = validatedBasic;
    }
    if (hasStandard) {
      const validatedStandard = this.validatePlanItem('standard', standardVal, false);
      result.standard = validatedStandard;
    }

    return result;
  }

  /**
   * Validates that a given categoryId references an active, non-deleted SERVICE-type category.
   * Throws BadRequestException if validation fails.
   */
  private async validateServiceCategory(categoryId: number): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category || category.deletedAt) {
      throw new BadRequestException(
        `Category with id ${categoryId} does not exist or has been deleted.`,
      );
    }

    if (!category.isActive) {
      throw new BadRequestException(
        `Category with id ${categoryId} is not active.`,
      );
    }

    if (category.categoryType !== CATEGORY_TYPE.SERVICE) {
      throw new BadRequestException(
        `Category with id ${categoryId} is a PRODUCT category. Services must be assigned to SERVICE-type categories only.`,
      );
    }
  }

  /**
   * Validates that a given templeId references an existing, non-deleted, and active Temple.
   * Throws NotFoundException if not found or deleted, and BadRequestException if inactive.
   */
  private async validateTemple(templeId: number): Promise<Temple> {
    const temple = await this.templeRepository.findOne({
      where: { id: templeId },
      withDeleted: true,
    });

    if (!temple || temple.deletedAt) {
      throw new NotFoundException(`Temple with id ${templeId} not found`);
    }

    if (!temple.isActive) {
      throw new BadRequestException(`Temple with id ${templeId} is inactive`);
    }

    return temple;
  }

  /**
   * Validates that a given templeId references an existing, non-deleted, and active Temple for customer/public access.
   * Throws NotFoundException if not found, deleted, or inactive.
   */
  private async validateTempleForPublicAccess(templeId: number): Promise<Temple> {
    const temple = await this.templeRepository.findOne({
      where: { id: templeId },
      withDeleted: true,
    });

    if (!temple || temple.deletedAt) {
      throw new NotFoundException(`Temple with id ${templeId} not found`);
    }

    if (!temple.isActive) {
      throw new NotFoundException(`Temple with id ${templeId} not found`);
    }

    return temple;
  }

  async createService(
    dto: CreateServiceDto,
    files: {
      icon?: Express.Multer.File[];
    },
    adminId: number,
  ) {
    try {
      if (dto.categoryId !== undefined && dto.categoryId !== null) {
        await this.validateServiceCategory(dto.categoryId);
      }

      let validatedTemple: Temple | null = null;
      if (dto.templeId !== undefined && dto.templeId !== null) {
        validatedTemple = await this.validateTemple(dto.templeId);
      }

      // Availability modes (isOnline, isOffline):
      // Require at least one availability mode to be true.
      // Defaults: isOnline = false, isOffline = true for backward compatibility.
      const resolvedIsOnline = dto.isOnline !== undefined
        ? Boolean(dto.isOnline)
        : false;
      const resolvedIsOffline = dto.isOffline !== undefined
        ? Boolean(dto.isOffline)
        : (!dto.isOnline);

      if (!resolvedIsOnline && !resolvedIsOffline) {
        throw new BadRequestException('Service must be available either online, offline, or both.');
      }

      // TODO: Client-supplied slug validation removed. Slugs are now automatically generated server-side from name.
      /*
      if (dto.slug && dto.slug.trim()) {
        const existingSlug = await this.serviceRepository.findOne({
          where: { slug: dto.slug.trim() },
        });
        if (existingSlug) {
          throw new ConflictException('Service with same slug already exists');
        }
      }
      */
      const generatedSlug = await generateUniqueSlug(this.serviceRepository, dto.name.trim());

      const existingWithName = await this.serviceRepository.find({
        where: { name: dto.name.trim() },
      });

      const conflictService = (existingWithName || []).find((s) => {
        const sIsOnline = Boolean(s.isOnline);
        const sIsOffline = Boolean(s.isOffline);
        return (resolvedIsOnline && sIsOnline) || (resolvedIsOffline && sIsOffline);
      });

      if (conflictService) {
        if (resolvedIsOnline && conflictService.isOnline && resolvedIsOffline && conflictService.isOffline) {
          throw new ConflictException(
            `An online and offline service with name "${dto.name.trim()}" already exists`,
          );
        } else if (resolvedIsOnline && conflictService.isOnline) {
          throw new ConflictException(
            `An online service with name "${dto.name.trim()}" already exists`,
          );
        } else {
          throw new ConflictException(
            `An offline service with name "${dto.name.trim()}" already exists`,
          );
        }
      }

      if (!dto.plans) {
        throw new BadRequestException(
          'plans must be an object containing at least one plan (basic or standard)',
        );
      }
      const resolvedPlans = this.validatePlans(dto.plans);

      const basicFeaturesToSync =
        resolvedPlans.basic && Array.isArray((resolvedPlans.basic as any).features)
          ? (resolvedPlans.basic as any).features
          : undefined;
      const standardFeaturesToSync =
        resolvedPlans.standard && Array.isArray((resolvedPlans.standard as any).features)
          ? (resolvedPlans.standard as any).features
          : undefined;

      if (resolvedPlans.basic) {
        delete (resolvedPlans.basic as any).features;
        delete (resolvedPlans.basic as any).items;
      }
      if (resolvedPlans.standard) {
        delete (resolvedPlans.standard as any).features;
        delete (resolvedPlans.standard as any).items;
      }

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
        const uploadKey = generatedSlug || adminId || 'service';
        iconUrl = await this.s3Service.uploadFileHelper(
          uploadKey,
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

      // Ensure valid cities list (support dto.cities and dto.city)
      const rawCities = dto.cities !== undefined ? dto.cities : (dto as any).city !== undefined ? (dto as any).city : [];
      const validCities = sanitizeServiceCities(rawCities);

      // Final condition: agar service main city h toh isGlobal = false, agar ek bhi city nahi h toh isGlobal = true
      const resolvedIsGlobal = validCities.length === 0;


      // TODO: PREVIOUS_SORT_ORDER_LOGIC
      // Previously, sortOrder: 0 was incorrectly treated as missing because of `Number(dto.sortOrder) > 0`,
      // which caused explicit 0 to default to maxOrder + 1. Also, maxOrder defaulted to 0 on an empty table,
      // creating the first service at position 1 instead of 0.
      /*
      let finalSortOrder: number;
      if (dto.sortOrder != null && Number(dto.sortOrder) > 0) {
        finalSortOrder = Number(dto.sortOrder);
        if (typeof this.serviceRepository?.shiftSortOrdersUp === 'function') {
          await this.serviceRepository.shiftSortOrdersUp(finalSortOrder);
        }
      } else {
        const maxOrder = typeof this.serviceRepository?.getMaxSortOrder === 'function'
          ? await this.serviceRepository.getMaxSortOrder()
          : 0;
        finalSortOrder = maxOrder + 1;
      }
      */
      let finalSortOrder: number;
      const hasExplicitSortOrder =
        dto.sortOrder !== undefined &&
        dto.sortOrder !== null &&
        !isNaN(Number(dto.sortOrder)) &&
        Number(dto.sortOrder) >= 0;

      if (hasExplicitSortOrder) {
        finalSortOrder = Number(dto.sortOrder);
        if (typeof this.serviceRepository?.shiftSortOrdersUp === 'function') {
          await this.serviceRepository.shiftSortOrdersUp(finalSortOrder);
        }
      } else {
        const maxOrder = typeof this.serviceRepository?.getMaxSortOrder === 'function'
          ? await this.serviceRepository.getMaxSortOrder()
          : null;
        finalSortOrder = maxOrder === null ? 0 : maxOrder + 1;
      }

      const service = this.serviceRepository.create({
        ...dto,
        slug: generatedSlug,
        templeId: dto.templeId ?? null,
        cities: validCities,
        languages: dto.languages ?? [],
        benefits: dto.benefits ?? [],
        purohitCarryItems: dto.purohitCarryItems ?? [],
        plans: resolvedPlans,
        // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
        // priceWithoutSamagri: resolvedPlans.basic.price,
        // priceWithSamagri: resolvedPlans.standard.price,
        tokenPercentage: dto.tokenPercentage != null ? Number(dto.tokenPercentage) : 30,
        metaTitle: dto.metaTitle?.trim() || null,
        metaDescription: dto.metaDescription?.trim() || null,
        iconUrl,
        isActive: dto.isActive ?? true,
        isGlobal: resolvedIsGlobal,
        isOnline: resolvedIsOnline,
        isOffline: resolvedIsOffline,
        isUpcomingFestival: dto.isUpcomingFestival ?? false,
        sortOrder: finalSortOrder,
      });

      // Explicitly guarantee values before save
      service.cities = validCities;
      service.isGlobal = resolvedIsGlobal;
      service.isOnline = resolvedIsOnline;
      service.isOffline = resolvedIsOffline;
      service.templeId = dto.templeId ?? null;
      service.slug = generatedSlug;
      service.sortOrder = finalSortOrder;

      const savedService = await this.serviceRepository.save(service);

      if (basicFeaturesToSync) {
        await this.syncServiceFeatures(
          savedService.id,
          SERVICE_FEATURE_PLAN.BASIC,
          basicFeaturesToSync,
        );
      }
      if (standardFeaturesToSync) {
        await this.syncServiceFeatures(
          savedService.id,
          SERVICE_FEATURE_PLAN.STANDARD,
          standardFeaturesToSync,
        );
      }
      const createdFeatures =
        typeof this.serviceFeatureRepository?.findByServiceId === 'function'
          ? await this.serviceFeatureRepository.findByServiceId(savedService.id)
          : [];

      (savedService as any).templeId = savedService.templeId ?? null;
      (savedService as any).temple = validatedTemple
        ? { id: validatedTemple.id, name: validatedTemple.name }
        : null;
      (savedService as any).slug = savedService.slug ?? null;

      if (savedService.iconUrl) {
        try {
          savedService.iconUrl = await this.s3Service.getDownloadUrl(
            savedService.iconUrl,
          );
        } catch (e) {
          console.error('Failed to generate signed URL:', e);
        }
      }

      // TODO: SERVICE_MESSAGE_IMPROVEMENT
      // Old message retained for reference; replaced with plan-aware message.
      // message: `Admin created new service ${savedService.name}.`,
      await this.auditLogService?.createAuditLog?.({
        actorId: adminId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.SERVICE,
        entity: 'Service',
        entityId: String(savedService.id),
        action: 'SERVICE_CREATED',
        message: `Service '${savedService.name}' was created successfully.`,
        oldValue: undefined,
        newValue: {
          name: savedService.name,
          slug: savedService.slug,
          templeId: savedService.templeId,
        },
      });

      if (this.notificationService) {
        try {
          await this.notificationService.notifyAdmins(
            'Service Created',
            `Service '${savedService.name}' was created successfully.`,
            NOTIFICATION_TYPE.SYSTEM,
            savedService.id,
            'SERVICE',
            {
              serviceId: savedService.id,
              serviceName: savedService.name,
              action: 'CREATED',
            },
          );
        } catch (err: any) {
          // Continue if admin notification fails
        }
      }

      // TODO: PLAN_BASED_PUROHIT_PAYOUT
      // Top-level purohitPayoutAmount removed from response.
      // (savedService as any).purohitPayoutAmount = this.computePurohitPayoutAmount(savedService);
      this.enrichServicePlansAndToken(savedService, createdFeatures);
      delete (savedService as any).serviceFeatures;

      // TODO: SERVICE_MESSAGE_IMPROVEMENT
      // Old message retained for reference; replaced with plan-aware message.
      // message: 'Service created successfully',
      return {
        success: true,
        message: `Service '${savedService.name}' was created successfully.`,
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

    const finalIsOnline = dto.isOnline !== undefined
      ? Boolean(dto.isOnline)
      : (service.isOnline ?? false);
    const finalIsOffline = dto.isOffline !== undefined
      ? Boolean(dto.isOffline)
      : (service.isOffline ?? true);

    if (!finalIsOnline && !finalIsOffline) {
      throw new BadRequestException('Service must be available either online, offline, or both.');
    }

    // TODO: Client-provided slug validation removed. Slugs are regenerated automatically on name change.
    /*
    if (dto.slug && dto.slug.trim()) {
      const existingSlug = await this.serviceRepository.findOne({
        where: { slug: dto.slug.trim() },
      });

      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException('Service with same slug already exists');
      }
    }
    */

    const targetName = dto.name !== undefined ? dto.name.trim() : service.name.trim();
    if (targetName) {
      const existingWithName = await this.serviceRepository.find({
        where: { name: targetName },
      });

      const conflictService = (existingWithName || []).find((s) => {
        if (s.id === id) return false;
        const sIsOnline = Boolean(s.isOnline);
        const sIsOffline = Boolean(s.isOffline);
        return (finalIsOnline && sIsOnline) || (finalIsOffline && sIsOffline);
      });

      if (conflictService) {
        if (finalIsOnline && conflictService.isOnline && finalIsOffline && conflictService.isOffline) {
          throw new ConflictException(
            `An online and offline service with name "${targetName}" already exists`,
          );
        } else if (finalIsOnline && conflictService.isOnline) {
          throw new ConflictException(
            `An online service with name "${targetName}" already exists`,
          );
        } else {
          throw new ConflictException(
            `An offline service with name "${targetName}" already exists`,
          );
        }
      }
    }

    let validatedTemple: Temple | null = null;
    if (dto.templeId !== undefined && dto.templeId !== null) {
      validatedTemple = await this.validateTemple(dto.templeId);
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.validateServiceCategory(dto.categoryId);
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
    const oldPurohitCarryItems = service.purohitCarryItems;
    // TODO: Deprecated - Samagri-based pricing replaced by Basic/Standard plans.
    // const oldPriceWithoutSamagri = service.priceWithoutSamagri;
    // const oldPriceWithSamagri = service.priceWithSamagri;
    const oldTokenPercentage = service.tokenPercentage;
    const oldPlans = service.plans;
    const oldTempleId = service.templeId;
    const oldTemple = service.temple;
    const oldName = service.name;
    const oldSlug = service.slug;
    const oldSortOrder = service.sortOrder;

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

    let basicFeaturesToSync: any[] | undefined = undefined;
    let standardFeaturesToSync: any[] | undefined = undefined;
    let mergedPlans: ServicePlans | undefined = undefined;
    if (dto.plans !== undefined) {
      if (!dto.plans || typeof dto.plans !== 'object' || Array.isArray(dto.plans)) {
        throw new BadRequestException('plans must be a valid object');
      }

      const allowedKeys = ['basic', 'standard', 'BASIC', 'STANDARD'];
      const planKeys = Object.keys(dto.plans);
      for (const key of planKeys) {
        if (!allowedKeys.includes(key)) {
          throw new BadRequestException(
            `Invalid plan key "${key}". Only "BASIC" and "STANDARD" are allowed`,
          );
        }
      }

      const currentPlans: ServicePlans = service.plans ?? {};

      const existingBasic = currentPlans.basic || currentPlans.BASIC;
      const existingStandard = currentPlans.standard || currentPlans.STANDARD;

      let newBasic: ServicePlanDetails | undefined = existingBasic
        ? { ...(existingBasic as ServicePlanDetails) }
        : undefined;
      let newStandard: ServicePlanDetails | undefined = existingStandard
        ? { ...(existingStandard as ServicePlanDetails) }
        : undefined;

      // Ensure features are removed from existing plans if previously stored
      if (newBasic) {
        delete (newBasic as any).features;
        delete (newBasic as any).items;
      }
      if (newStandard) {
        delete (newStandard as any).features;
        delete (newStandard as any).items;
      }

      const rawBasic = dto.plans.basic !== undefined ? dto.plans.basic : (dto.plans as any).BASIC;
      const rawStandard = dto.plans.standard !== undefined ? dto.plans.standard : (dto.plans as any).STANDARD;

      if (rawBasic !== undefined) {
        const validatedBasic = this.validatePlanItem('basic', rawBasic, true);
        const resolvedPrice =
          validatedBasic.price !== undefined
            ? Number(validatedBasic.price)
            : (currentPlans.basic?.price ?? currentPlans.BASIC?.price ?? 0);

        if (Array.isArray((validatedBasic as any).features)) {
          basicFeaturesToSync = (validatedBasic as any).features;
        }

        // Filter out features/items and null/undefined values: only store pricing in plan object
        const cleanBasicPricing: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(validatedBasic)) {
          if (
            val !== null &&
            val !== undefined &&
            key !== 'features' &&
            key !== 'items'
          ) {
            cleanBasicPricing[key] = val;
          }
        }

        newBasic = {
          ...cleanBasicPricing,
          price: resolvedPrice,
        };
      }

      if (rawStandard !== undefined) {
        const validatedStandard = this.validatePlanItem('standard', rawStandard, true);
        const resolvedPrice =
          validatedStandard.price !== undefined
            ? Number(validatedStandard.price)
            : (currentPlans.standard?.price ?? currentPlans.STANDARD?.price ?? 0);

        if (Array.isArray((validatedStandard as any).features)) {
          standardFeaturesToSync = (validatedStandard as any).features;
        }

        // Filter out features/items and null/undefined values: only store pricing in plan object
        const cleanStandardPricing: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(validatedStandard)) {
          if (
            val !== null &&
            val !== undefined &&
            key !== 'features' &&
            key !== 'items'
          ) {
            cleanStandardPricing[key] = val;
          }
        }

        newStandard = {
          ...cleanStandardPricing,
          price: resolvedPrice,
        };
      }

      mergedPlans = {};
      if (newBasic) {
        mergedPlans.basic = newBasic;
      }
      if (newStandard) {
        mergedPlans.standard = newStandard;
      }
    }


    if (dto.sortOrder !== undefined && dto.sortOrder !== null) {
      const newSortOrder = Number(dto.sortOrder);
      if (newSortOrder !== oldSortOrder) {
        if (oldSortOrder != null && oldSortOrder > 0) {
          if (newSortOrder < oldSortOrder) {
            // Service moved up (e.g., from 10 to 2):
            // All services in [newSortOrder, oldSortOrder - 1] shift +1 (e.g., 2 -> 3, 3 -> 4, etc.)
            await this.serviceRepository.shiftSortOrdersUp(newSortOrder, oldSortOrder, service.id);
          } else if (newSortOrder > oldSortOrder) {
            // Service moved down (e.g., from 2 to 10):
            // All services in [oldSortOrder + 1, newSortOrder] shift -1 (e.g., 3 -> 2, 4 -> 3, etc.)
            await this.serviceRepository.shiftSortOrdersDown(oldSortOrder, newSortOrder, service.id);
          }
        } else if (newSortOrder > 0) {
          // Previously had sortOrder 0 or unassigned, now assigned positive newSortOrder:
          // Shift all services >= newSortOrder by +1
          await this.serviceRepository.shiftSortOrdersUp(newSortOrder, undefined, service.id);
        }

        service.sortOrder = newSortOrder;
      }
    }

    Object.assign(service, dto);

    if (dto.metaTitle !== undefined) {
      service.metaTitle = dto.metaTitle?.trim() || null;
    }
    if (dto.metaDescription !== undefined) {
      service.metaDescription = dto.metaDescription?.trim() || null;
    }

    if (dto.sortOrder !== undefined && dto.sortOrder !== null) {
      service.sortOrder = Number(dto.sortOrder);
    }

    service.isOnline = finalIsOnline;
    service.isOffline = finalIsOffline;

    // Safeguard plans and pricing fields against unintentional overwrites
    if (mergedPlans !== undefined) {
      service.plans = mergedPlans;
    } else {
      service.plans = oldPlans;
    }

    // Regenerate slug if name changed, or self-heal if missing on existing record.
    // Client-provided slug is ignored.
    // TODO: Deprecated client-provided slug assignment:
    /*
    if (dto.slug === undefined) {
      service.slug = oldSlug;
    } else if (dto.slug === null) {
      service.slug = null;
    } else {
      service.slug = dto.slug.trim();
    }
    */
    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName !== oldName) {
        service.slug = await generateUniqueSlug(this.serviceRepository, trimmedName, service.id);
      } else {
        service.slug = oldSlug || (await generateUniqueSlug(this.serviceRepository, trimmedName, service.id));
      }
    } else if (!oldSlug) {
      service.slug = await generateUniqueSlug(this.serviceRepository, service.name, service.id);
    } else {
      service.slug = oldSlug;
    }

    if (dto.templeId === undefined) {
      service.templeId = oldTempleId;
      service.temple = oldTemple;
    } else if (dto.templeId === null) {
      service.templeId = null;
      service.temple = null;
    } else {
      service.templeId = dto.templeId;
      service.temple = validatedTemple;
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

    if (dto.cities !== undefined || (dto as any).city !== undefined) {
      const rawInput = dto.cities !== undefined ? dto.cities : (dto as any).city;
      service.cities = sanitizeServiceCities(rawInput);
    }
    if (dto.languages !== undefined) {
      service.languages = dto.languages ?? [];
    }
    if (dto.benefits !== undefined) {
      service.benefits = dto.benefits ?? [];
    }
    if (dto.purohitCarryItems !== undefined) {
      service.purohitCarryItems = dto.purohitCarryItems ?? [];
    }

    // Ensure valid cities list from current service.cities
    const validCities = sanitizeServiceCities(service.cities);
    service.cities = validCities;

    // Final condition: agar kisi service main city h toh isGlobal = false, agar ek bhi city nahi h toh isGlobal = true
    service.isGlobal = validCities.length === 0;

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

    const oldIconUrl = service.iconUrl;
    const iconFile = files?.icon;
    const hasIconFile = Boolean(
      iconFile && iconFile.length > 0 && iconFile[0]?.buffer && iconFile[0].buffer.length > 0,
    );

    if (hasIconFile && iconFile) {
      service.iconUrl = await this.s3Service.uploadFileHelper(
        service.slug || service.name || 'service',
        'icon',
        iconFile,
      );
      if (
        oldIconUrl &&
        oldIconUrl !== service.iconUrl &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldIconUrl) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldIconUrl);
      }
    } else if (typeof dto.iconUrl === 'string' && dto.iconUrl.trim().length > 0) {
      service.iconUrl = dto.iconUrl.trim();
    } else {
      service.iconUrl = null as any;
      if (
        oldIconUrl &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldIconUrl) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldIconUrl);
      }
    }

    const updated = await this.serviceRepository.save(service);

    if (basicFeaturesToSync !== undefined) {
      await this.syncServiceFeatures(
        updated.id,
        SERVICE_FEATURE_PLAN.BASIC,
        basicFeaturesToSync,
      );
    }

    if (standardFeaturesToSync !== undefined) {
      await this.syncServiceFeatures(
        updated.id,
        SERVICE_FEATURE_PLAN.STANDARD,
        standardFeaturesToSync,
      );
    }

    if (updated.templeId) {
      if (validatedTemple) {
        (updated as any).temple = { id: validatedTemple.id, name: validatedTemple.name };
      } else {
        const t = await this.templeRepository.findOne({
          where: { id: updated.templeId },
        });
        (updated as any).temple = t ? { id: t.id, name: t.name } : null;
      }
    } else {
      (updated as any).temple = null;
      (updated as any).templeId = null;
    }
    (updated as any).slug = updated.slug ?? null;

    const hasBasicPlan = Boolean(dto.plans && dto.plans.basic !== undefined);
    const hasStandardPlan = Boolean(dto.plans && dto.plans.standard !== undefined);
    const hasCarryBasic = Boolean(
      dto.purohitCarryItems &&
      typeof dto.purohitCarryItems === 'object' &&
      !Array.isArray(dto.purohitCarryItems) &&
      (dto.purohitCarryItems as any).basic !== undefined,
    );
    const hasCarryStandard = Boolean(
      dto.purohitCarryItems &&
      typeof dto.purohitCarryItems === 'object' &&
      !Array.isArray(dto.purohitCarryItems) &&
      (dto.purohitCarryItems as any).standard !== undefined,
    );

    const isBasicModified = hasBasicPlan || hasCarryBasic;
    const isStandardModified = hasStandardPlan || hasCarryStandard;

    let updateMessage: string;
    if (isBasicModified && isStandardModified) {
      updateMessage = `Service '${updated.name}' - BASIC and STANDARD plans were updated successfully.`;
    } else if (isBasicModified) {
      updateMessage = `Service '${updated.name}' - BASIC plan was updated successfully.`;
    } else if (isStandardModified) {
      updateMessage = `Service '${updated.name}' - STANDARD plan was updated successfully.`;
    } else {
      updateMessage = `Service '${updated.name}' was updated successfully.`;
    }

    const updatedFields: Record<string, unknown> = { name: updated.name };
    if (dto.cities !== undefined) updatedFields.cities = updated.cities;
    if (dto.languages !== undefined) updatedFields.languages = updated.languages;
    if (dto.benefits !== undefined) updatedFields.benefits = updated.benefits;
    if (dto.purohitCarryItems !== undefined) updatedFields.purohitCarryItems = updated.purohitCarryItems;
    if (dto.plans !== undefined) updatedFields.plans = updated.plans;
    if (dto.templeId !== undefined) updatedFields.templeId = updated.templeId;
    // TODO: Obsolete client dto.slug check. Slug changes are now tracked via updated.slug !== oldSlug.
    if (updated.slug !== oldSlug) updatedFields.slug = updated.slug;
    if (isBasicModified && !isStandardModified) updatedFields.plan = 'BASIC';
    if (!isBasicModified && isStandardModified) updatedFields.plan = 'STANDARD';
    if (isBasicModified && isStandardModified) updatedFields.plan = 'BASIC, STANDARD';

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: `Admin updated service ${updated.name}.`,
    await this.auditLogService?.createAuditLog?.({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'Service',
      entityId: String(updated.id),
      action: 'SERVICE_UPDATED',
      message: updateMessage,
      oldValue: {
        cities: oldCities,
        languages: oldLanguages,
        benefits: oldBenefits,
        purohitCarryItems: oldPurohitCarryItems,
        plans: oldPlans,
        templeId: oldTempleId,
        slug: oldSlug,
      },
      newValue: updatedFields,
    });

    if (this.notificationService) {
      try {
        let notificationMessage: string;
        if (isBasicModified && isStandardModified) {
          notificationMessage = `'${updated.name}' - BASIC and STANDARD plans were updated successfully.`;
        } else if (isBasicModified) {
          notificationMessage = `'${updated.name}' - BASIC plan was updated successfully.`;
        } else if (isStandardModified) {
          notificationMessage = `'${updated.name}' - STANDARD plan was updated successfully.`;
        } else {
          notificationMessage = `'${updated.name}' was updated successfully.`;
        }

        await this.notificationService.notifyAdmins(
          'Service Updated',
          notificationMessage,
          NOTIFICATION_TYPE.SYSTEM,
          updated.id,
          'SERVICE',
          {
            serviceId: updated.id,
            serviceName: updated.name,
            action: 'UPDATED',
            plan: isBasicModified && isStandardModified ? 'BASIC, STANDARD' : isBasicModified ? 'BASIC' : isStandardModified ? 'STANDARD' : undefined,
          },
        );
      } catch (err: any) {
        // Continue if admin notification fails
      }
    }

    const updatedFeatures =
      typeof this.serviceFeatureRepository?.findByServiceId === 'function'
        ? await this.serviceFeatureRepository.findByServiceId(updated.id)
        : [];
    this.enrichServicePlansAndToken(updated, updatedFeatures);
    delete (updated as any).serviceFeatures;

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Service updated successfully',
    return {
      success: true,
      message: updateMessage,
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
    (service as any).sortOrder = Number(service.sortOrder ?? 0);
    const serviceFeatures =
      typeof this.serviceFeatureRepository?.findByServiceId === 'function'
        ? await this.serviceFeatureRepository.findByServiceId(id)
        : [];
    this.enrichServicePlansAndToken(service, serviceFeatures);
    delete (service as any).serviceFeatures;

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
      const { hasBookings, hasPayments } =
        await this.serviceRepository.hasBookingsOrPayments(id);

      // Production Data Protection Policy: Services must always be soft-deleted to guarantee
      // that historical bookings, invoices, payouts, and financial ledgers are preserved forever.
      service.isActive = false;
      await this.serviceRepository.save(service);
      await this.serviceRepository.softRemove(service);
      const isSoftDeleted = true;

      // TODO: SERVICE_MESSAGE_IMPROVEMENT
      // Old message retained for reference; replaced with plan-aware message.
      // message: `Admin deleted service ${service.name}.`,
      await this.auditLogService?.createAuditLog?.({
        actorId: adminId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.SERVICE,
        entity: 'Service',
        entityId: String(id),
        action: isSoftDeleted ? 'SERVICE_SOFT_DELETED' : 'SERVICE_DELETED',
        message: isSoftDeleted
          ? `Service '${service.name}' had existing bookings/payments and was soft-deleted.`
          : `Service '${service.name}' was deleted successfully.`,
        oldValue: undefined,
        newValue: { deleted: true, softDelete: isSoftDeleted },
      });

      if (this.notificationService) {
        try {
          await this.notificationService.notifyAdmins(
            isSoftDeleted ? 'Service Soft-Deleted' : 'Service Deleted',
            isSoftDeleted
              ? `Service '${service.name}' had existing records and was soft-deleted.`
              : `Service '${service.name}' was deleted successfully.`,
            NOTIFICATION_TYPE.SYSTEM,
            id,
            'SERVICE',
            {
              serviceId: id,
              serviceName: service.name,
              action: isSoftDeleted ? 'SOFT_DELETED' : 'DELETED',
            },
          );
        } catch (err: any) {
          // Continue if admin notification fails
        }
      }

      return {
        success: true,
        message: isSoftDeleted
          ? `Service '${service.name}' has existing booking or payment records and was soft-deleted successfully.`
          : `Service '${service.name}' was deleted successfully.`,
        isSoftDeleted,
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

    const statusAction = isActive ? 'activated' : 'deactivated';
    const statusMessage = `Service '${service.name}' was ${statusAction} successfully.`;

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: `Admin updated service #${id} (${service.name}) status to ${isActive}.`,
    await this.auditLogService?.createAuditLog?.({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'Service',
      entityId: String(id),
      action: 'SERVICE_STATUS_UPDATED',
      message: statusMessage,
      oldValue: { isActive: oldStatus },
      newValue: { isActive },
    });

    if (this.notificationService) {
      try {
        await this.notificationService.notifyAdmins(
          `Service ${isActive ? 'Activated' : 'Deactivated'}`,
          statusMessage,
          NOTIFICATION_TYPE.SYSTEM,
          id,
          'SERVICE',
          {
            serviceId: id,
            serviceName: service.name,
            action: isActive ? 'ACTIVATED' : 'DEACTIVATED',
            isActive,
          },
        );
      } catch (err: any) {
        // Continue if admin notification fails
      }
    }

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Service status updated successfully',
    return {
      success: true,
      message: statusMessage,
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
        'You are not authorized to delete this service',
      );
    }

    await this.PurohitServiceRepository.softDelete(Id);

    const deleteMessage = purohitService.service?.name
      ? `Service '${purohitService.service.name}' was deleted successfully.`
      : 'Purohit service deleted successfully';

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Purohit service deleted successfully',
    return {
      success: true,
      message: deleteMessage,
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

    const serviceName = updatedService.service?.name || purohitService.service?.name;
    const updateMessage = serviceName
      ? `Service '${serviceName}' was updated successfully.`
      : 'Purohit service updated successfully';

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Purohit service updated successfully',
    return {
      success: true,
      message: updateMessage,
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

    if (purohitService.service) {
      const sortOrder = Number(purohitService.service.sortOrder ?? 0);
      (purohitService.service as any).sortOrder = sortOrder;
      (purohitService as any).sortOrder = sortOrder;

      if (purohitService.service.id && this.serviceFeatureRepository) {
        try {
          const features = await this.serviceFeatureRepository.findByServiceId(
            purohitService.service.id,
          );
          this.enrichServicePlansAndToken(purohitService.service, features);
          delete (purohitService.service as any).serviceFeatures;
        } catch (err) {
          console.error('Failed to load features for purohit service:', err);
        }
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
        return {
          ...cat,
          metaTitle: cat.metaTitle ?? null,
          metaDescription: cat.metaDescription ?? null,
          iconDownloadurl,
        };
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
      data: {
        ...category,
        metaTitle: category.metaTitle ?? null,
        metaDescription: category.metaDescription ?? null,
        iconDownloadurl,
      },
    };
  }

  async createCategory(
    dto: CreateCategoryDto,
    files: { icon?: Express.Multer.File[] },
    adminId: number,
  ) {
    // Resolve categoryType — default to SERVICE for backward compatibility
    const categoryType: CATEGORY_TYPE = dto.categoryType ?? CATEGORY_TYPE.SERVICE;

    // Composite uniqueness check: same name is OK across different types
    const existing = await this.categoryRepository.findByNameAndType(dto.name.trim(), categoryType);
    if (existing) {
      throw new ConflictException(
        `A ${categoryType.toLowerCase()} category with name "${dto.name}" already exists`,
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

    const slug = await generateUniqueSlug(this.categoryRepository, dto.name.trim());

    const category = this.categoryRepository.create({
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim(),
      metaTitle: dto.metaTitle?.trim() || null,
      metaDescription: dto.metaDescription?.trim() || null,
      iconUrl: iconKey ?? dto.iconUrl,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      categoryType,
    });

    const saved = await this.categoryRepository.save(category);

    const categoryMessage = `${categoryType === CATEGORY_TYPE.PRODUCT ? 'Product' : 'Service'} category '${saved.name}' was created successfully.`;

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: `Admin created service category "${saved.name}"`,
    await this.auditLogService?.createAuditLog?.({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'ServiceCategory',
      entityId: String(saved.id),
      action: 'CATEGORY_CREATED',
      message: categoryMessage,
      newValue: { id: saved.id, name: saved.name, categoryType: saved.categoryType },
    });

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Service category created successfully',
    return {
      success: true,
      message: categoryMessage,
      data: saved,
    };
  }

  async updateCategory(
    id: number,
    dto: UpdateCategoryDto,
    files: { icon?: Express.Multer.File[] },
    adminId: number,
  ) {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Service category with id ${id} not found`);
    }

    // Guard against categoryType change when entities are already assigned
    const currentCategoryType = category.categoryType || CATEGORY_TYPE.SERVICE;
    if (dto.categoryType !== undefined && dto.categoryType !== currentCategoryType) {
      if (dto.categoryType === CATEGORY_TYPE.PRODUCT) {
        // Changing to PRODUCT: reject if services are currently assigned
        const serviceCount = await this.serviceRepository.count({
          where: { categoryId: id },
        });
        if (serviceCount > 0) {
          throw new BadRequestException(
            `Cannot change category type to PRODUCT: ${serviceCount} service(s) are assigned to this category. Remove the assignments first.`,
          );
        }
      } else if (dto.categoryType === CATEGORY_TYPE.SERVICE) {
        // Changing to SERVICE: reject if products are currently assigned
        const productCount = await this.categoryRepository.countProductsForCategory(id);
        if (productCount > 0) {
          throw new BadRequestException(
            `Cannot change category type to SERVICE: ${productCount} product(s) are assigned to this category. Remove the assignments first.`,
          );
        }
      }
    }

    // Composite name uniqueness check (only when name is being changed)
    const newName = dto.name?.trim();
    const targetType = dto.categoryType ?? category.categoryType;
    if (newName && newName !== category.name) {
      const existing = await this.categoryRepository.findByNameAndType(newName, targetType);
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `A ${targetType.toLowerCase()} category with name "${newName}" already exists`,
        );
      }
    }

    const oldSnapshot = {
      name: category.name,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      categoryType: category.categoryType,
    };

    const oldIconUrl = category.iconUrl;
    const iconFile = files?.icon;
    const hasIconFile = Boolean(
      iconFile && iconFile.length > 0 && iconFile[0]?.buffer && iconFile[0].buffer.length > 0,
    );

    if (hasIconFile && iconFile) {
      category.iconUrl = await this.s3Service.uploadFileHelper(
        `service-categories`,
        'icon',
        iconFile,
      );
      if (
        oldIconUrl &&
        oldIconUrl !== category.iconUrl &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldIconUrl) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldIconUrl);
      }
    } else if (typeof dto.iconUrl === 'string' && dto.iconUrl.trim().length > 0) {
      category.iconUrl = dto.iconUrl.trim();
    } else {
      category.iconUrl = null as any;
      if (
        oldIconUrl &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldIconUrl) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldIconUrl);
      }
    }

    if (newName !== undefined) {
      if (newName !== category.name) {
        category.name = newName;
        category.slug = await generateUniqueSlug(this.categoryRepository, newName, category.id);
      }
    } else if (!category.slug) {
      category.slug = await generateUniqueSlug(this.categoryRepository, category.name, category.id);
    }
    if (dto.description !== undefined) category.description = dto.description?.trim();
    if (dto.metaTitle !== undefined) category.metaTitle = dto.metaTitle?.trim() || null;
    if (dto.metaDescription !== undefined) category.metaDescription = dto.metaDescription?.trim() || null;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    if (dto.categoryType !== undefined) category.categoryType = dto.categoryType;

    const updated = await this.categoryRepository.save(category);

    const updateCategoryMessage = `${updated.categoryType === CATEGORY_TYPE.PRODUCT ? 'Product' : 'Service'} category '${updated.name}' was updated successfully.`;

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: `Admin updated service category id ${id}`,
    await this.auditLogService?.createAuditLog?.({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'ServiceCategory',
      entityId: String(id),
      action: 'CATEGORY_UPDATED',
      message: updateCategoryMessage,
      oldValue: oldSnapshot,
      newValue: {
        name: updated.name,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
        categoryType: updated.categoryType,
      },
    });

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Service category updated successfully',
    return {
      success: true,
      message: updateCategoryMessage,
      data: updated,
    };
  }

  async deleteCategory(id: number, adminId: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Service category with id ${id} not found`);
    }

    // Guard: prevent deleting when services or products are associated with it
    const serviceCount = await this.serviceRepository.count({
      where: { categoryId: id },
    });
    if (serviceCount > 0) {
      throw new BadRequestException(
        `Cannot delete this category: ${serviceCount} service(s) are assigned to it. Reassign or remove them first.`,
      );
    }

    const productCount = await this.categoryRepository.countProductsForCategory(id);
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete this category: ${productCount} product(s) are assigned to it. Reassign or remove them first.`,
      );
    }

    await this.categoryRepository.softDelete(id);

    const deleteCategoryMessage = `${category.categoryType === CATEGORY_TYPE.PRODUCT ? 'Product' : 'Service'} category '${category.name}' was deleted successfully.`;

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: `Admin soft-deleted service category "${category.name}" (id: ${id})`,
    await this.auditLogService?.createAuditLog?.({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.SERVICE,
      entity: 'ServiceCategory',
      entityId: String(id),
      action: 'CATEGORY_DELETED',
      message: deleteCategoryMessage,
      oldValue: { name: category.name, categoryType: category.categoryType },
    });

    // TODO: SERVICE_MESSAGE_IMPROVEMENT
    // Old message retained for reference; replaced with plan-aware message.
    // message: 'Service category deleted successfully',
    return {
      success: true,
      message: deleteCategoryMessage,
    };
  }
}

