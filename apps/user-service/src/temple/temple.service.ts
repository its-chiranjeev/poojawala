import { Injectable, NotFoundException } from '@nestjs/common';
import { TempleRepository } from '@poojawala/repositories';
import { CreateTempleDto, UpdateTempleDto, GetTemplesQueryDto } from '@poojawala/dtos';
import { Temple, ACTOR_TYPE, USER_ROLE, AUDIT_MODULE } from '@poojawala/entities';
import { AuditLogService, generateUniqueSlug } from '@poojawala/common';
import { S3Service } from '@poojawala/s3';

@Injectable()
export class TempleService {
  constructor(
    private readonly templeRepository: TempleRepository,
    private readonly auditLogService: AuditLogService,
    private readonly s3Service: S3Service,
  ) { }

  private formatTempleResponse(temple: Temple, downloadUrl: string | null, services?: any[]) {
    const formatted: any = {
      id: temple.id,
      name: temple.name,
      slug: temple.slug ?? null,
      description: temple.description,
      metaTitle: temple.metaTitle ?? null,
      metaDescription: temple.metaDescription ?? null,
      imageUrl: temple.imageUrl,
      downloadUrl,
      address: temple.address,
      city: temple.city,
      state: temple.state,
      isActive: temple.isActive,
      createdAt: temple.createdAt,
      updatedAt: temple.updatedAt,
      deletedAt: temple.deletedAt,
    };

    if (services !== undefined) {
      formatted.services = services.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug ?? null,
        description: s.description ?? null,
        metaTitle: s.metaTitle ?? null,
        metaDescription: s.metaDescription ?? null,
        iconUrl: s.iconUrl ?? null,
        iconDownloadurl: s.iconDownloadurl ?? null,
        isActive: s.isActive,
        plans: s.plans ?? null,
      }));
    }

    return formatted;
  }

  private enrichServicePlansAndToken(service: any, serviceFeatures?: any[]) {
    if (!service || !service.plans) return null;

    const effectiveTokenPercentage =
      service.tokenPercentage != null && Number(service.tokenPercentage) > 0
        ? Number(service.tokenPercentage)
        : 30;

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
      const enrichedPlans: Record<string, any> = { ...plans };
      const allFeatures = Array.isArray(serviceFeatures) ? serviceFeatures : [];

      for (const [key, plan] of Object.entries(plans)) {
        if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
          const rawPlanRecord = { ...(plan as any) };

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

            const planPayoutFieldKey = `${key}PurohitPayoutAmount`;
            const platformCommission = Number(
              ((planPrice * effectiveCommissionPercentage) / 100).toFixed(2),
            );
            structuredPlan[planPayoutFieldKey] = Number(
              (planPrice - platformCommission).toFixed(2),
            );
          } else {
            if (rawPlanRecord.price != null) {
              structuredPlan.price = rawPlanRecord.price;
            }
          }

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
            }
          }

          enrichedPlans[key] = structuredPlan;
        }
      }

      return enrichedPlans;
    }

    return plans;
  }

  async createTemple(
    dto: CreateTempleDto,
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
    },
    adminId?: number,
  ) {
    let imageUrl: string | null = dto.imageUrl ? dto.imageUrl.trim() : null;

    const fileToUpload = files?.imageUrl || files?.image;
    if (fileToUpload?.length) {
      imageUrl =
        (await this.s3Service.uploadFileHelper(
          adminId || 'temple',
          'temple',
          fileToUpload,
        )) || null;
    }

    const slug = await generateUniqueSlug(this.templeRepository, dto.name.trim());

    const temple = this.templeRepository.create({
      name: dto.name.trim(),
      slug,
      description: dto.description ?? null,
      metaTitle: dto.metaTitle ?? null,
      metaDescription: dto.metaDescription ?? null,
      imageUrl,
      address: dto.address ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    const saved = await this.templeRepository.save(temple);

    let downloadUrl: string | null = null;
    if (saved.imageUrl) {
      try {
        downloadUrl = await this.s3Service.getDownloadUrl(saved.imageUrl);
      } catch {
        downloadUrl = saved.imageUrl;
      }
    }

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.TEMPLE,
      entity: 'Temple',
      entityId: String(saved.id),
      action: 'TEMPLE_CREATED',
      message: `Admin created new temple ${saved.name}.`,
      oldValue: undefined,
      newValue: {
        name: saved.name,
        description: saved.description,
        imageUrl: saved.imageUrl,
        address: saved.address,
        city: saved.city,
        state: saved.state,
        isActive: saved.isActive,
      },
    });

    return {
      success: true,
      statusCode: 201,
      message: 'Temple created successfully',
      data: this.formatTempleResponse(saved, downloadUrl),
    };
  }

  async updateTemple(
    id: number,
    dto: UpdateTempleDto,
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
    },
    adminId?: number,
  ) {
    const temple = await this.templeRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!temple || temple.deletedAt) {
      throw new NotFoundException(`Temple with id ${id} not found`);
    }

    const oldValue = {
      name: temple.name,
      description: temple.description,
      metaTitle: temple.metaTitle,
      metaDescription: temple.metaDescription,
      imageUrl: temple.imageUrl,
      address: temple.address,
      city: temple.city,
      state: temple.state,
      isActive: temple.isActive,
    };

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName !== temple.name) {
        temple.name = trimmedName;
        temple.slug = await generateUniqueSlug(this.templeRepository, trimmedName, temple.id);
      }
    } else if (!temple.slug) {
      // Self-heal slug if missing on existing record
      temple.slug = await generateUniqueSlug(this.templeRepository, temple.name, temple.id);
    }
    if (dto.description !== undefined) {
      temple.description = dto.description;
    }
    if (dto.metaTitle !== undefined) {
      temple.metaTitle = dto.metaTitle;
    }
    if (dto.metaDescription !== undefined) {
      temple.metaDescription = dto.metaDescription;
    }
    if (dto.address !== undefined) {
      temple.address = dto.address;
    }
    if (dto.city !== undefined) {
      temple.city = dto.city;
    }
    if (dto.state !== undefined) {
      temple.state = dto.state;
    }
    if (dto.isActive !== undefined) {
      temple.isActive = dto.isActive;
    }

    const oldImageUrl = temple.imageUrl;
    const fileToUpload = files?.imageUrl || files?.image;
    const hasImageFile = Boolean(
      fileToUpload && fileToUpload.length > 0 && fileToUpload[0]?.buffer && fileToUpload[0].buffer.length > 0,
    );

    if (hasImageFile && fileToUpload) {
      temple.imageUrl =
        (await this.s3Service.uploadFileHelper(
          adminId || 'temple',
          'temple',
          fileToUpload,
        )) || null;
      if (
        oldImageUrl &&
        oldImageUrl !== temple.imageUrl &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldImageUrl) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldImageUrl);
      }
    } else if (typeof dto.imageUrl === 'string' && dto.imageUrl.trim().length > 0) {
      temple.imageUrl = dto.imageUrl.trim();
    } else {
      temple.imageUrl = null;
      if (
        oldImageUrl &&
        typeof this.s3Service?.isVercelBlobUrl === 'function' &&
        this.s3Service.isVercelBlobUrl(oldImageUrl) &&
        typeof this.s3Service?.deleteByUrl === 'function'
      ) {
        await this.s3Service.deleteByUrl(oldImageUrl);
      }
    }

    const updated = await this.templeRepository.save(temple);

    let downloadUrl: string | null = null;
    if (updated.imageUrl) {
      try {
        downloadUrl = await this.s3Service.getDownloadUrl(updated.imageUrl);
      } catch {
        downloadUrl = updated.imageUrl;
      }
    }

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.TEMPLE,
      entity: 'Temple',
      entityId: String(id),
      action: 'TEMPLE_UPDATED',
      message: `Admin updated temple ${updated.name}.`,
      oldValue,
      newValue: {
        name: updated.name,
        description: updated.description,
        imageUrl: updated.imageUrl,
        address: updated.address,
        city: updated.city,
        state: updated.state,
        isActive: updated.isActive,
      },
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Temple updated successfully',
      data: this.formatTempleResponse(updated, downloadUrl),
    };
  }

  async deleteTemple(id: number, adminId?: number) {
    const temple = await this.templeRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!temple || temple.deletedAt) {
      throw new NotFoundException(`Temple with id ${id} not found`);
    }

    temple.deletedAt = new Date();
    await this.templeRepository.save(temple);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.TEMPLE,
      entity: 'Temple',
      entityId: String(id),
      action: 'TEMPLE_DELETED',
      message: `Admin soft deleted temple ${temple.name}.`,
      oldValue: {
        name: temple.name,
        isActive: temple.isActive,
      },
      newValue: {
        deleted: true,
      },
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Temple deleted successfully',
    };
  }

  async getTemples(query: GetTemplesQueryDto, isAdmin: boolean = false) {
    const result = await this.templeRepository.findAllTemples(query, isAdmin);

    const dataWithDownloadUrls = await Promise.all(
      result.data.map(async (item: Temple) => {
        let downloadUrl: string | null = null;
        if (item.imageUrl) {
          try {
            downloadUrl = await this.s3Service.getDownloadUrl(item.imageUrl);
          } catch {
            downloadUrl = item.imageUrl;
          }
        }
        return this.formatTempleResponse(item, downloadUrl);
      }),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Temples fetched successfully',
      data: dataWithDownloadUrls,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async getTempleById(id: number, isAdmin: boolean = false) {
    const temple = await this.templeRepository.findTempleById(id, isAdmin);

    if (!temple) {
      throw new NotFoundException(`Temple with id ${id} not found`);
    }

    let downloadUrl: string | null = null;
    if (temple.imageUrl) {
      try {
        downloadUrl = await this.s3Service.getDownloadUrl(temple.imageUrl);
      } catch {
        downloadUrl = temple.imageUrl;
      }
    }

    const services = await this.templeRepository.findActiveServicesByTempleId(id);

    let enrichedServices: any[] | undefined = undefined;
    if (services !== undefined && Array.isArray(services)) {
      const serviceIds = services.map((s) => s.id).filter(Boolean);
      const featuresByServiceId = new Map<number, any[]>();
      if (
        serviceIds.length > 0 &&
        typeof this.templeRepository.findFeaturesByServiceIds === 'function'
      ) {
        try {
          const allFeatures =
            await this.templeRepository.findFeaturesByServiceIds(serviceIds);
          for (const feat of allFeatures || []) {
            const list = featuresByServiceId.get(feat.serviceId) || [];
            list.push(feat);
            featuresByServiceId.set(feat.serviceId, list);
          }
        } catch (e) {
          console.error(
            'Failed to load service features for temple services:',
            e,
          );
        }
      }

      enrichedServices = await Promise.all(
        services.map(async (s) => {
          let iconDownloadurl: string | null = null;
          if (s.iconUrl) {
            try {
              iconDownloadurl = await this.s3Service.getDownloadUrl(s.iconUrl);
            } catch {
              iconDownloadurl = s.iconUrl;
            }
          }

          const features = featuresByServiceId.get(s.id) || [];
          const plans = this.enrichServicePlansAndToken(s, features);

          return {
            id: s.id,
            name: s.name,
            slug: s.slug ?? null,
            description: s.description ?? null,
            iconUrl: s.iconUrl ?? null,
            iconDownloadurl: iconDownloadurl ?? null,
            isActive: s.isActive,
            plans: plans ?? null,
          };
        }),
      );
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Temple fetched successfully',
      data: this.formatTempleResponse(temple, downloadUrl, enrichedServices),
    };
  }
}
