import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TempleRepository } from '@poojawala/repositories';
import { CreateTempleDto, UpdateTempleDto, GetTemplesQueryDto } from '@poojawala/dtos';
import {
  Temple,
  TempleAarti,
  Service,
  ServiceFeature,
  ACTOR_TYPE,
  USER_ROLE,
  AUDIT_MODULE,
  TEMPLE_VERIFICATION_STATUS,
  NOTIFICATION_TYPE,
  User,
} from '@poojawala/entities';
import { AuditLogService, generateUniqueSlug } from '@poojawala/common';
import { S3Service } from '@poojawala/s3';
import { EmailService } from '@poojawala/email-services';
import { NotificationService } from '@poojawala/notification';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { ServiceService } from '../service/service.service';

export interface FormattedAartiResponse {
  id: number;
  templeId: number;
  name: string | null;
  slug: string | null;
  time: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormattedTempleResponse {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  imageUrl: string | null;
  downloadUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  primaryDeity: string | null;
  trustName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  openingTime: string | null;
  closingTime: string | null;
  trustRegNo: string | null;
  trustDocUrl: string | null;
  trustDocDownloadUrl: string | null;
  deityPhotoUrl: string | null;
  deityPhotoDownloadUrl: string | null;
  isActive: boolean;
  submittedByUserId?: number | null;
  verificationStatus?: TEMPLE_VERIFICATION_STATUS;
  verificationRemarks?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  services?: Record<string, unknown>[];
  aartis?: FormattedAartiResponse[];
}

@Injectable()
export class TempleService {
  private readonly logger = new Logger(TempleService.name);

  constructor(
    private readonly templeRepository: TempleRepository,
    private readonly auditLogService: AuditLogService,
    private readonly s3Service: S3Service,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly serviceService?: ServiceService,
  ) { }

  private async runInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.dataSource && typeof this.dataSource.transaction === 'function') {
      return this.dataSource.transaction(operation);
    }
    if (this.templeRepository?.manager && typeof this.templeRepository.manager.transaction === 'function') {
      return this.templeRepository.manager.transaction(operation);
    }
    throw new Error('No transaction manager available');
  }

  private formatTempleResponse(
    temple: Temple,
    downloadUrl: string | null,
    services?: Record<string, unknown>[],
    aartis?: TempleAarti[],
    trustDocDownloadUrl?: string | null,
    deityPhotoDownloadUrl?: string | null,
  ): FormattedTempleResponse {
    const formatted: FormattedTempleResponse = {
      id: temple.id,
      name: temple.name,
      slug: temple.slug ?? null,
      description: temple.description ?? null,
      metaTitle: temple.metaTitle ?? null,
      metaDescription: temple.metaDescription ?? null,
      imageUrl: temple.imageUrl ?? null,
      downloadUrl,
      address: temple.address ?? null,
      city: temple.city ?? null,
      state: temple.state ?? null,
      primaryDeity: temple.primaryDeity ?? null,
      trustName: temple.trustName ?? null,
      contactName: temple.contactName ?? null,
      phone: temple.phone ?? null,
      email: temple.email ?? null,
      openingTime: temple.openingTime ?? null,
      closingTime: temple.closingTime ?? null,
      trustRegNo: temple.trustRegNo ?? null,
      trustDocUrl: temple.trustDocUrl ?? null,
      trustDocDownloadUrl: trustDocDownloadUrl !== undefined ? trustDocDownloadUrl : (temple.trustDocUrl ?? null),
      deityPhotoUrl: temple.deityPhotoUrl ?? null,
      deityPhotoDownloadUrl: deityPhotoDownloadUrl !== undefined ? deityPhotoDownloadUrl : (temple.deityPhotoUrl ?? null),
      isActive: temple.isActive,
      submittedByUserId: temple.submittedByUserId ?? null,
      verificationStatus: temple.verificationStatus,
      verificationRemarks: temple.verificationRemarks ?? null,
      createdAt: temple.createdAt,
      updatedAt: temple.updatedAt,
      deletedAt: temple.deletedAt,
    };

    // TODO: Previous shallow service mapping kept for reference:
    /*
    if (services !== undefined) {
      formatted.services = services.map((s) => ({
        id: s['id'],
        name: s['name'],
        slug: s['slug'] ?? null,
        description: s['description'] ?? null,
        metaTitle: s['metaTitle'] ?? null,
        metaDescription: s['metaDescription'] ?? null,
        iconUrl: s['iconUrl'] ?? null,
        iconDownloadurl: s['iconDownloadurl'] ?? s['iconUrl'] ?? null,
        isActive: s['isActive'],
        plans: s['plans'] ?? null,
      }));
    }
    */
    if (services !== undefined) {
      formatted.services = services.map((s) => {
        const item = { ...s };
        delete item['temple'];
        delete item['bookings'];
        delete item['purohitServices'];
        delete item['serviceFeatures'];
        delete item['deletedAt'];
        return item;
      });
    }

    const effectiveAartis = aartis !== undefined ? aartis : temple.aartis;
    if (effectiveAartis !== undefined) {
      formatted.aartis = effectiveAartis
        .filter((a) => !a.deletedAt)
        .map((a) => ({
          id: a.id,
          templeId: a.templeId,
          name: a.name ?? null,
          slug: a.slug ?? null,
          time: a.time ?? null,
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        }));
    }

    return formatted;
  }

  private enrichServicePlansAndToken(service: Record<string, unknown>, serviceFeatures?: ServiceFeature[]) {
    if (!service || !service['plans']) return null;

    const effectiveTokenPercentage =
      service['tokenPercentage'] != null && Number(service['tokenPercentage']) > 0
        ? Number(service['tokenPercentage'])
        : 30;

    const effectiveCommissionPercentage =
      service['commissionPercentage'] != null
        ? Number(service['commissionPercentage'])
        : 10;

    let plans = service['plans'];
    if (typeof plans === 'string') {
      try {
        plans = JSON.parse(plans);
      } catch { }
    }

    if (plans && typeof plans === 'object' && !Array.isArray(plans)) {
      const enrichedPlans: Record<string, unknown> = {};
      const allFeatures = Array.isArray(serviceFeatures) ? serviceFeatures : [];

      for (const [key, plan] of Object.entries(plans)) {
        if (
          (key === 'BASIC' && 'basic' in plans) ||
          (key === 'STANDARD' && 'standard' in plans)
        ) {
          continue;
        }
        const planKey = key.toLowerCase();
        if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
          const rawPlanRecord: Record<string, unknown> = { ...(plan as Record<string, unknown>) };

          const structuredPlan: Record<string, unknown> = {};

          if (
            rawPlanRecord['price'] != null &&
            !isNaN(Number(rawPlanRecord['price'])) &&
            Number(rawPlanRecord['price']) > 0
          ) {
            const planPrice = Number(rawPlanRecord['price']);
            structuredPlan['price'] = planPrice;

            const tokenAmount = Number(
              ((planPrice * effectiveTokenPercentage) / 100).toFixed(2),
            );
            structuredPlan['tokenAmount'] = tokenAmount;

            const planPayoutFieldKey = `${key}PurohitPayoutAmount`;
            const platformCommission = Number(
              ((planPrice * effectiveCommissionPercentage) / 100).toFixed(2),
            );
            structuredPlan[planPayoutFieldKey] = Number(
              (planPrice - platformCommission).toFixed(2),
            );
          } else {
            if (rawPlanRecord['price'] != null) {
              structuredPlan['price'] = rawPlanRecord['price'];
            }
          }

          const pricingKeys = new Set(['price', 'tokenAmount', `${key}PurohitPayoutAmount`]);
          const planDbFeatures = allFeatures.filter(
            (f: ServiceFeature) => String(f.plan).toLowerCase() === key.toLowerCase(),
          );

          if (planDbFeatures.length > 0) {
            structuredPlan['features'] = planDbFeatures;
          } else if (Array.isArray(rawPlanRecord['features']) && rawPlanRecord['features'].length > 0) {
            structuredPlan['features'] = rawPlanRecord['features'];
          } else {
            const features: Record<string, unknown> = {};
            if (
              rawPlanRecord['features'] &&
              typeof rawPlanRecord['features'] === 'object' &&
              !Array.isArray(rawPlanRecord['features'])
            ) {
              Object.assign(features, rawPlanRecord['features']);
            }
            if (
              rawPlanRecord['items'] &&
              typeof rawPlanRecord['items'] === 'object' &&
              !Array.isArray(rawPlanRecord['items'])
            ) {
              Object.assign(features, rawPlanRecord['items']);
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
              structuredPlan['features'] = features;
            }
          }

          enrichedPlans[planKey] = structuredPlan;
        }
      }

      return enrichedPlans;
    }

    return plans;
  }

  private async enrichFullServiceDetails(
    service: Service | Record<string, unknown>,
    features: ServiceFeature[] = [],
  ): Promise<Record<string, unknown>> {
    const s = service as any;
    let iconDownloadurl: string | null = null;
    if (s.iconUrl) {
      try {
        iconDownloadurl = await this.s3Service.getDownloadUrl(s.iconUrl);
      } catch {
        iconDownloadurl = s.iconUrl;
      }
    }

    const plans = this.enrichServicePlansAndToken(
      s,
      features,
    );

    const result: Record<string, unknown> = {
      ...s,
      slug: s.slug ?? null,
      description: s.description ?? null,
      metaTitle: s.metaTitle ?? null,
      metaDescription: s.metaDescription ?? null,
      iconUrl: s.iconUrl ?? null,
      iconDownloadurl: iconDownloadurl ?? s.iconUrl ?? null,
      plans: plans ?? s.plans ?? null,
    };

    if (s.sortOrder !== undefined && s.sortOrder !== null) {
      result.sortOrder = Number(s.sortOrder);
    }
    if (s.minPrice !== undefined && s.minPrice !== null) {
      result.minPrice = Number(s.minPrice);
    }
    if (s.maxPrice !== undefined && s.maxPrice !== null) {
      result.maxPrice = Number(s.maxPrice);
    }
    if (s.tokenPercentage !== undefined && s.tokenPercentage !== null) {
      result.tokenPercentage = Number(s.tokenPercentage);
    }
    if (s.commissionPercentage !== undefined && s.commissionPercentage !== null) {
      result.commissionPercentage = Number(s.commissionPercentage);
    }

    delete result.temple;
    delete result.bookings;
    delete result.purohitServices;
    delete result.serviceFeatures;
    delete result.deletedAt;

    return result;
  }

  async createTemple(
    dto: CreateTempleDto,
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
      trustDoc?: Express.Multer.File[];
      trustDocUrl?: Express.Multer.File[];
      deityPhoto?: Express.Multer.File[];
      deityPhotoUrl?: Express.Multer.File[];
    },
    adminId?: number,
  ) {
    return this.createTempleWithUser(dto, files, adminId);
  }

  async createTempleWithUser(
    dto: CreateTempleDto,
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
      trustDoc?: Express.Multer.File[];
      trustDocUrl?: Express.Multer.File[];
      deityPhoto?: Express.Multer.File[];
      deityPhotoUrl?: Express.Multer.File[];
    },
    userOrAdminId?: User | number,
  ) {
    const user = typeof userOrAdminId === 'object' ? userOrAdminId : undefined;
    const actorId = user ? user.id : (typeof userOrAdminId === 'number' ? userOrAdminId : undefined);
    const isPurohit = user?.role === USER_ROLE.PUROHIT;

    if (dto.services && dto.services.length > 0) {
      if (isPurohit || (user && user.role !== USER_ROLE.ADMIN)) {
        throw new ForbiddenException('Only admins can create services with temple registration');
      }
    }

    let submittedByUserId: number | null = null;
    let verificationStatus: TEMPLE_VERIFICATION_STATUS;
    let verificationRemarks: string | null = null;

    if (isPurohit) {
      submittedByUserId = user!.id;
      verificationStatus = TEMPLE_VERIFICATION_STATUS.PENDING;
      verificationRemarks = null;
    } else {
      submittedByUserId = null;
      verificationStatus = dto.verificationStatus || TEMPLE_VERIFICATION_STATUS.APPROVED;
      verificationRemarks = null;
    }

    let imageUrl: string | null = dto.imageUrl ? dto.imageUrl.trim() : null;
    const fileToUpload = files?.imageUrl || files?.image;
    if (fileToUpload?.length) {
      imageUrl =
        (await this.s3Service.uploadFileHelper(
          actorId || 'temple',
          'temple',
          fileToUpload,
        )) || null;
    }

    let trustDocUrl: string | null = dto.trustDocUrl ? dto.trustDocUrl.trim() : null;
    const trustDocFile = files?.trustDocUrl || files?.trustDoc;
    if (trustDocFile?.length) {
      trustDocUrl =
        (await this.s3Service.uploadFileHelper(
          actorId || 'temple',
          'temple/docs',
          trustDocFile,
        )) || null;
    }

    let deityPhotoUrl: string | null = dto.deityPhotoUrl ? dto.deityPhotoUrl.trim() : null;
    const deityPhotoFile = files?.deityPhotoUrl || files?.deityPhoto;
    if (deityPhotoFile?.length) {
      deityPhotoUrl =
        (await this.s3Service.uploadFileHelper(
          actorId || 'temple',
          'temple/deity',
          deityPhotoFile,
        )) || null;
    }

    const { savedTemple, savedAartis, savedServices, submitterUser } = await this.runInTransaction(
      async (manager: EntityManager) => {
        const templeRepo = manager.getRepository(Temple);
        const aartiRepo = manager.getRepository(TempleAarti);

        const slug = dto.slug?.trim()
          ? await generateUniqueSlug(templeRepo, dto.slug.trim())
          : await generateUniqueSlug(templeRepo, dto.name.trim());

        const temple = templeRepo.create({
          name: dto.name.trim(),
          slug,
          description: dto.description ?? null,
          metaTitle: dto.metaTitle ?? null,
          metaDescription: dto.metaDescription ?? null,
          imageUrl,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          primaryDeity: dto.primaryDeity ?? null,
          trustName: dto.trustName ?? null,
          contactName: dto.contactName ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          openingTime: dto.openingTime ?? null,
          closingTime: dto.closingTime ?? null,
          trustRegNo: dto.trustRegNo ?? null,
          trustDocUrl,
          deityPhotoUrl,
          isActive: dto.isActive !== undefined ? dto.isActive : true,
          submittedByUserId,
          verificationStatus,
          verificationRemarks,
        });

        const saved = await templeRepo.save(temple);

        const aartisList: TempleAarti[] = [];
        if (dto.aartis && dto.aartis.length > 0) {
          for (const aartiDto of dto.aartis) {
            if (!aartiDto.name || !aartiDto.name.trim()) {
              throw new BadRequestException('Aarti name is required and cannot be empty');
            }
            const aartiName = aartiDto.name.trim();
            const aartiSlug = aartiDto.slug?.trim()
              ? aartiDto.slug.trim()
              : await generateUniqueSlug(aartiRepo, aartiName);

            const aarti = aartiRepo.create({
              templeId: saved.id,
              name: aartiName,
              slug: aartiSlug,
              time: aartiDto.time ? aartiDto.time.trim() : null,
              isActive: aartiDto.isActive !== undefined ? aartiDto.isActive : true,
            });

            const savedAarti = await aartiRepo.save(aarti);
            aartisList.push(savedAarti);
          }
        }

        const servicesList: Record<string, unknown>[] = [];
        if (dto.services && dto.services.length > 0) {
          if (!this.serviceService) {
            throw new InternalServerErrorException('ServiceService is not available');
          }
          for (const serviceDto of dto.services) {
            // Override templeId with the newly created temple ID
            serviceDto.templeId = saved.id;
            const serviceResult = await this.serviceService.createService(
              serviceDto,
              undefined,
              actorId,
              manager,
              { skipNotifications: true, skipTempleValidation: true },
            );
            if (serviceResult && serviceResult.data) {
              servicesList.push(serviceResult.data as unknown as Record<string, unknown>);
            }
          }
        }

        await this.auditLogService.createAuditLog(
          {
            actorId,
            actorType: ACTOR_TYPE.USER,
            actorRole: isPurohit ? USER_ROLE.PUROHIT : USER_ROLE.ADMIN,
            module: AUDIT_MODULE.TEMPLE,
            entity: 'Temple',
            entityId: String(saved.id),
            action: 'TEMPLE_CREATED',
            message: isPurohit
              ? `Purohit registered temple submission ${saved.name}.`
              : `Admin created new temple ${saved.name}.`,
            oldValue: undefined,
            newValue: {
              name: saved.name,
              description: saved.description,
              imageUrl: saved.imageUrl,
              address: saved.address,
              city: saved.city,
              state: saved.state,
              isActive: saved.isActive,
              verificationStatus: saved.verificationStatus,
              submittedByUserId: saved.submittedByUserId,
            },
          },
        );

        let submitterUser: User | null = null;
        if (isPurohit && saved.submittedByUserId) {
          submitterUser = await manager.getRepository(User).findOne({
            where: { id: saved.submittedByUserId },
          });
        }

        return {
          savedTemple: saved,
          savedAartis: aartisList,
          savedServices: dto.services !== undefined ? servicesList : undefined,
          submitterUser,
        };
      },
    );

    const effectiveSubmitterUser = submitterUser || (user && user.email ? user : null);

    if (savedServices && savedServices.length > 0 && this.notificationService) {
      for (const s of savedServices) {
        try {
          await this.notificationService.notifyAdmins(
            'Service Created',
            `Service '${s['name']}' was created successfully.`,
            NOTIFICATION_TYPE.SYSTEM,
            Number(s['id']),
            'SERVICE',
            {
              serviceId: s['id'],
              serviceName: s['name'],
              templeId: savedTemple.id,
              action: 'CREATED',
            },
          );
        } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to notify admins of service creation for service ${s['id']}: ${errMessage}`,
          );
        }
      }
    }

    if (isPurohit && this.notificationService) {
      try {
        await this.notificationService.notifyAdmins(
          'New Temple Submitted for Verification',
          `A Purohit has submitted "${savedTemple.name}" for Admin review.`,
          NOTIFICATION_TYPE.SYSTEM,
          savedTemple.id,
          'TEMPLE',
          {
            templeId: savedTemple.id,
            templeName: savedTemple.name,
            submittedByUserId: savedTemple.submittedByUserId,
            action: 'TEMPLE_SUBMISSION_CREATED',
          },
        );
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to notify admins of temple submission for temple ${savedTemple.id}: ${errMessage}`,
        );
      }
    }

    if (isPurohit && this.emailService) {
      if (!effectiveSubmitterUser || !effectiveSubmitterUser.email || !effectiveSubmitterUser.email.trim()) {
        this.logger.warn(
          `Purohit created temple ${savedTemple.id} (${savedTemple.name}), but submitting user ${savedTemple.submittedByUserId} has no valid email address; skipping registration email delivery.`,
        );
      } else {
        const submitterEmail = effectiveSubmitterUser.email.trim();
        const submitterName =
          [effectiveSubmitterUser.firstName, effectiveSubmitterUser.lastName].filter(Boolean).join(' ') ||
          'Purohit';
        try {
          await this.emailService.sendTempleSubmittedEmail({
            email: submitterEmail,
            templeName: savedTemple.name,
            purohitName: submitterName,
          });
        } catch (error: unknown) {
          const errMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to deliver temple registration confirmation email for temple ${savedTemple.id} to submitter ${savedTemple.submittedByUserId}: ${errMessage}`,
          );
        }
      }
    }

    let downloadUrl: string | null = null;
    if (savedTemple.imageUrl) {
      try {
        downloadUrl = await this.s3Service.getDownloadUrl(savedTemple.imageUrl);
      } catch {
        downloadUrl = savedTemple.imageUrl;
      }
    }

    let trustDocDownloadUrl: string | null = null;
    if (savedTemple.trustDocUrl) {
      try {
        trustDocDownloadUrl = await this.s3Service.getDownloadUrl(savedTemple.trustDocUrl);
      } catch {
        trustDocDownloadUrl = savedTemple.trustDocUrl;
      }
    }

    let deityPhotoDownloadUrl: string | null = null;
    if (savedTemple.deityPhotoUrl) {
      try {
        deityPhotoDownloadUrl = await this.s3Service.getDownloadUrl(savedTemple.deityPhotoUrl);
      } catch {
        deityPhotoDownloadUrl = savedTemple.deityPhotoUrl;
      }
    }

    return {
      success: true,
      statusCode: 201,
      message: 'Temple created successfully',
      data: this.formatTempleResponse(
        savedTemple,
        downloadUrl,
        dto.services !== undefined ? savedServices : undefined,
        dto.aartis !== undefined ? savedAartis : undefined,
        trustDocDownloadUrl,
        deityPhotoDownloadUrl,
      ),
    };
  }

  async updateTemple(
    id: number,
    dto: UpdateTempleDto,
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
      trustDoc?: Express.Multer.File[];
      trustDocUrl?: Express.Multer.File[];
      deityPhoto?: Express.Multer.File[];
      deityPhotoUrl?: Express.Multer.File[];
    },
    adminId?: number,
  ) {
    return this.updateTempleWithUser(id, dto, files, adminId);
  }

  async updateTempleWithUser(
    id: number,
    dto: UpdateTempleDto,
    files?: {
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
      trustDoc?: Express.Multer.File[];
      trustDocUrl?: Express.Multer.File[];
      deityPhoto?: Express.Multer.File[];
      deityPhotoUrl?: Express.Multer.File[];
    },
    userOrAdminId?: User | number,
  ) {
    const user = typeof userOrAdminId === 'object' ? userOrAdminId : undefined;
    const actorId = user ? user.id : (typeof userOrAdminId === 'number' ? userOrAdminId : undefined);
    const isPurohit = user?.role === USER_ROLE.PUROHIT;
    const isAdmin = !user || user.role === USER_ROLE.ADMIN;

    const { updated, aartisList, servicesList, statusTransition, submitterUser, finalRemarks } =
      await this.runInTransaction(async (manager: EntityManager) => {
        const templeRepo = manager.getRepository(Temple);
        const aartiRepo = manager.getRepository(TempleAarti);

        const temple = await templeRepo.findOne({
          where: { id },
          withDeleted: true,
        });

        if (!temple || temple.deletedAt) {
          throw new NotFoundException(`Temple with id ${id} not found`);
        }

        if (isPurohit) {
          if (temple.submittedByUserId !== user!.id) {
            throw new ForbiddenException('You are not authorized to update this temple');
          }
          if (dto.verificationStatus !== undefined || dto.verificationRemarks !== undefined) {
            throw new ForbiddenException('Purohits cannot change verification status or remarks');
          }
          if (dto.services !== undefined && dto.services.length > 0) {
            throw new ForbiddenException('Purohits cannot remove services from a temple');
          }
        } else if (!isAdmin) {
          throw new ForbiddenException('You are not authorized to update this temple');
        }

        const previousStatus = temple.verificationStatus;
        let transition: 'APPROVED' | 'REJECTED' | 'PENDING' | null = null;

        if (isAdmin) {
          if (dto.verificationStatus !== undefined) {
            const targetStatus = dto.verificationStatus;

            if (targetStatus === TEMPLE_VERIFICATION_STATUS.REJECTED) {
              const remarks = dto.verificationRemarks;
              if (!remarks || typeof remarks !== 'string' || !remarks.trim()) {
                throw new BadRequestException(
                  'A non-empty reason/remarks is required when rejecting a temple submission',
                );
              }
              if (previousStatus !== TEMPLE_VERIFICATION_STATUS.REJECTED) {
                transition = 'REJECTED';
              }
              temple.verificationStatus = TEMPLE_VERIFICATION_STATUS.REJECTED;
              temple.verificationRemarks = remarks.trim();
            } else if (targetStatus === TEMPLE_VERIFICATION_STATUS.APPROVED) {
              if (
                previousStatus === TEMPLE_VERIFICATION_STATUS.PENDING ||
                previousStatus === TEMPLE_VERIFICATION_STATUS.REJECTED
              ) {
                transition = 'APPROVED';
              }
              temple.verificationStatus = TEMPLE_VERIFICATION_STATUS.APPROVED;
              if (dto.verificationRemarks !== undefined) {
                temple.verificationRemarks =
                  dto.verificationRemarks &&
                    typeof dto.verificationRemarks === 'string' &&
                    dto.verificationRemarks.trim() !== ''
                    ? dto.verificationRemarks.trim()
                    : null;
              } else {
                temple.verificationRemarks = null;
              }
            } else if (targetStatus === TEMPLE_VERIFICATION_STATUS.PENDING) {
              if (previousStatus !== TEMPLE_VERIFICATION_STATUS.PENDING) {
                transition = 'PENDING';
              }
              temple.verificationStatus = TEMPLE_VERIFICATION_STATUS.PENDING;
              if (dto.verificationRemarks !== undefined) {
                temple.verificationRemarks =
                  dto.verificationRemarks &&
                    typeof dto.verificationRemarks === 'string' &&
                    dto.verificationRemarks.trim() !== ''
                    ? dto.verificationRemarks.trim()
                    : null;
              }
            }
          } else if (dto.verificationRemarks !== undefined) {
            temple.verificationRemarks =
              dto.verificationRemarks &&
                typeof dto.verificationRemarks === 'string' &&
                dto.verificationRemarks.trim() !== ''
                ? dto.verificationRemarks.trim()
                : null;
          }
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
          verificationStatus: temple.verificationStatus,
          verificationRemarks: temple.verificationRemarks,
        };

        if (dto.name !== undefined) {
          const trimmedName = dto.name.trim();
          if (trimmedName !== temple.name) {
            temple.name = trimmedName;
            temple.slug = await generateUniqueSlug(templeRepo, trimmedName, temple.id);
          }
        } else if (!temple.slug) {
          // Self-heal slug if missing on existing record
          temple.slug = await generateUniqueSlug(templeRepo, temple.name, temple.id);
        }

        if (dto.slug !== undefined) {
          const trimmedSlug = dto.slug ? dto.slug.trim() : '';
          if (trimmedSlug && trimmedSlug !== temple.slug) {
            temple.slug = await generateUniqueSlug(templeRepo, trimmedSlug, temple.id);
          }
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
        if (dto.primaryDeity !== undefined) {
          temple.primaryDeity =
            dto.primaryDeity && typeof dto.primaryDeity === 'string' && dto.primaryDeity.trim() !== ''
              ? dto.primaryDeity.trim()
              : null;
        }
        if (dto.trustName !== undefined) {
          temple.trustName =
            dto.trustName && typeof dto.trustName === 'string' && dto.trustName.trim() !== ''
              ? dto.trustName.trim()
              : null;
        }
        if (dto.contactName !== undefined) {
          temple.contactName =
            dto.contactName && typeof dto.contactName === 'string' && dto.contactName.trim() !== ''
              ? dto.contactName.trim()
              : null;
        }
        if (dto.phone !== undefined) {
          temple.phone =
            dto.phone && typeof dto.phone === 'string' && dto.phone.trim() !== ''
              ? dto.phone.trim()
              : null;
        }
        if (dto.email !== undefined) {
          temple.email =
            dto.email && typeof dto.email === 'string' && dto.email.trim() !== ''
              ? dto.email.trim().toLowerCase()
              : null;
        }
        if (dto.openingTime !== undefined) {
          temple.openingTime =
            dto.openingTime && typeof dto.openingTime === 'string' && dto.openingTime.trim() !== ''
              ? dto.openingTime.trim()
              : null;
        }
        if (dto.closingTime !== undefined) {
          temple.closingTime =
            dto.closingTime && typeof dto.closingTime === 'string' && dto.closingTime.trim() !== ''
              ? dto.closingTime.trim()
              : null;
        }
        if (dto.trustRegNo !== undefined) {
          temple.trustRegNo =
            dto.trustRegNo && typeof dto.trustRegNo === 'string' && dto.trustRegNo.trim() !== ''
              ? dto.trustRegNo.trim()
              : null;
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
              actorId || 'temple',
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

        const trustDocFile = files?.trustDocUrl || files?.trustDoc;
        const hasTrustDocFile = Boolean(
          trustDocFile && trustDocFile.length > 0 && trustDocFile[0]?.buffer && trustDocFile[0].buffer.length > 0,
        );
        if (hasTrustDocFile && trustDocFile) {
          temple.trustDocUrl =
            (await this.s3Service.uploadFileHelper(
              actorId || 'temple',
              'temple/docs',
              trustDocFile,
            )) || null;
        } else if (dto.trustDocUrl !== undefined) {
          temple.trustDocUrl = dto.trustDocUrl ? dto.trustDocUrl.trim() : null;
        }

        const deityPhotoFile = files?.deityPhotoUrl || files?.deityPhoto;
        const hasDeityPhotoFile = Boolean(
          deityPhotoFile && deityPhotoFile.length > 0 && deityPhotoFile[0]?.buffer && deityPhotoFile[0].buffer.length > 0,
        );
        if (hasDeityPhotoFile && deityPhotoFile) {
          temple.deityPhotoUrl =
            (await this.s3Service.uploadFileHelper(
              actorId || 'temple',
              'temple/deity',
              deityPhotoFile,
            )) || null;
        } else if (dto.deityPhotoUrl !== undefined) {
          temple.deityPhotoUrl = dto.deityPhotoUrl ? dto.deityPhotoUrl.trim() : null;
        }

        const savedTemple = await templeRepo.save(temple);

        let activeAartis: TempleAarti[] | undefined = undefined;

        if (dto.aartis !== undefined) {
          const incomingIds = dto.aartis
            .map((a) => a.id)
            .filter((aId): aId is number => typeof aId === 'number' && !isNaN(aId));

          const existingMap = new Map<number, TempleAarti>();
          if (incomingIds.length > 0) {
            const existingRecords = await aartiRepo.find({
              where: { id: In(incomingIds) },
              withDeleted: true,
            });
            for (const r of existingRecords) {
              existingMap.set(r.id, r);
            }

            for (const aId of incomingIds) {
              const record = existingMap.get(aId);
              if (!record) {
                throw new BadRequestException(`Aarti with id ${aId} not found`);
              }
              if (record.templeId !== id) {
                throw new BadRequestException(
                  `Aarti with id ${aId} does not belong to temple ${id}`,
                );
              }
              if (record.deletedAt) {
                throw new BadRequestException(
                  `Aarti with id ${aId} has already been deleted and cannot be modified`,
                );
              }
            }
          }

          for (const item of dto.aartis) {
            if (item.id) {
              const existingAarti = existingMap.get(item.id)!;
              if (item.isDeleted === true || item.delete === true) {
                existingAarti.deletedAt = new Date();
                await aartiRepo.save(existingAarti);
                continue;
              }

              if (item.name !== undefined) {
                const trimmedName = item.name.trim();
                if (!trimmedName) {
                  throw new BadRequestException('Aarti name cannot be empty');
                }
                if (trimmedName !== existingAarti.name) {
                  existingAarti.name = trimmedName;
                  existingAarti.slug = await generateUniqueSlug(
                    aartiRepo,
                    trimmedName,
                    existingAarti.id,
                  );
                }
              }
              if (item.slug !== undefined) {
                existingAarti.slug = item.slug ? item.slug.trim() : existingAarti.slug;
              }
              if (item.time !== undefined) {
                existingAarti.time = item.time ? item.time.trim() : null;
              }
              if (item.isActive !== undefined) {
                existingAarti.isActive = item.isActive;
              }
              await aartiRepo.save(existingAarti);
            } else {
              if (item.isDeleted === true || item.delete === true) {
                throw new BadRequestException('Cannot delete an aarti without providing an id');
              }
              if (!item.name || !item.name.trim()) {
                throw new BadRequestException('Aarti name is required for new aartis');
              }
              const aartiName = item.name.trim();
              const aartiSlug = item.slug?.trim()
                ? item.slug.trim()
                : await generateUniqueSlug(aartiRepo, aartiName);

              const newAarti = aartiRepo.create({
                templeId: id,
                name: aartiName,
                slug: aartiSlug,
                time: item.time ? item.time.trim() : null,
                isActive: item.isActive !== undefined ? item.isActive : true,
              });
              await aartiRepo.save(newAarti);
            }
          }

          activeAartis = await aartiRepo.find({
            where: { templeId: id, deletedAt: IsNull() },
            order: { time: 'ASC', id: 'ASC' },
          });
        }

        let servicesList: Record<string, unknown>[] | undefined = undefined;

        if (dto.services !== undefined) {
          if (dto.services.length > 0) {
            if (isPurohit) {
              throw new ForbiddenException('Purohits cannot remove services from a temple');
            }

            const incomingServiceIds = dto.services
              .map((s) => s.id)
              .filter((sId): sId is number => typeof sId === 'number' && !isNaN(sId));

            for (const item of dto.services) {
              if (!item.id) {
                throw new BadRequestException('Cannot update or remove a service without providing an id');
              }
            }

            const uniqueIds = new Set(incomingServiceIds);
            if (uniqueIds.size !== incomingServiceIds.length) {
              throw new BadRequestException('Duplicate service IDs are not allowed in the same request');
            }

            const serviceRepo = manager.getRepository(Service);
            const existingServiceRecords = await serviceRepo.find({
              where: { id: In(incomingServiceIds) },
              withDeleted: true,
            });

            const existingServiceMap = new Map<number, Service>();
            for (const r of existingServiceRecords) {
              existingServiceMap.set(r.id, r);
            }

            for (const sId of incomingServiceIds) {
              const record = existingServiceMap.get(sId);
              if (!record) {
                throw new BadRequestException(`Service with id ${sId} not found`);
              }
              if (record.templeId !== id) {
                throw new BadRequestException(
                  `Service with id ${sId} does not belong to temple ${id}`,
                );
              }
              if (record.deletedAt) {
                throw new BadRequestException(
                  `Service with id ${sId} has already been deleted and cannot be modified`,
                );
              }
            }

            // TODO: Previous remove/delete-only loop kept for reference:
            /*
            for (const item of dto.services) {
              if (item.delete === true) {
                const existingService = existingServiceMap.get(item.id)!;
                existingService.deletedAt = new Date();
                existingService.isActive = false;
                await serviceRepo.save(existingService);
              } else if (item.remove === true) {
                const existingService = existingServiceMap.get(item.id)!;
                existingService.templeId = null;
                await serviceRepo.save(existingService);
              }
            }
            */

            for (const item of dto.services) {
              if (item.templeId !== undefined && item.templeId !== null && item.templeId !== id) {
                throw new BadRequestException(
                  `Cannot reassign service with id ${item.id} to another temple via temple update`,
                );
              }

              if (item.delete === true) {
                const existingService = existingServiceMap.get(item.id)!;
                existingService.deletedAt = new Date();
                existingService.isActive = false;
                await serviceRepo.save(existingService);
              } else if (item.remove === true) {
                const existingService = existingServiceMap.get(item.id)!;
                existingService.templeId = null;
                await serviceRepo.save(existingService);
              } else {
                // Update service details using existing service update logic
                if (this.serviceService) {
                  await this.serviceService.updateService(
                    item.id,
                    item,
                    undefined,
                    actorId,
                    manager,
                    { skipNotifications: true, skipTempleValidation: true },
                  );
                } else {
                  // Fallback if serviceService is not injected
                  const existingService = existingServiceMap.get(item.id)!;
                  if (item.name !== undefined) {
                    existingService.name = item.name.trim();
                  }
                  if (item.description !== undefined) {
                    existingService.description = item.description;
                  }
                  if (item.durationMinutes !== undefined) {
                    existingService.durationMinutes = item.durationMinutes;
                  }
                  if (item.isActive !== undefined) {
                    existingService.isActive = item.isActive;
                  }
                  await serviceRepo.save(existingService);
                }
              }
            }
          }

          const remainingServices = await manager.getRepository(Service).find({
            where: { templeId: id, deletedAt: IsNull() },
            order: { sortOrder: 'ASC', id: 'ASC' },
          });
          servicesList = remainingServices as unknown as Record<string, unknown>[];
        }

        await this.auditLogService.createAuditLog({
          actorId,
          actorType: ACTOR_TYPE.USER,
          actorRole: isPurohit ? USER_ROLE.PUROHIT : USER_ROLE.ADMIN,
          module: AUDIT_MODULE.TEMPLE,
          entity: 'Temple',
          entityId: String(id),
          action: 'TEMPLE_UPDATED',
          message: isPurohit
            ? `Purohit updated temple ${savedTemple.name}.`
            : `Admin updated temple ${savedTemple.name}.`,
          oldValue,
          newValue: {
            name: savedTemple.name,
            description: savedTemple.description,
            imageUrl: savedTemple.imageUrl,
            address: savedTemple.address,
            city: savedTemple.city,
            state: savedTemple.state,
            isActive: savedTemple.isActive,
            verificationStatus: savedTemple.verificationStatus,
            verificationRemarks: savedTemple.verificationRemarks,
          },
        });

        let submitterUser: User | null = null;
        if (transition && savedTemple.submittedByUserId) {
          submitterUser = await manager.getRepository(User).findOne({
            where: { id: savedTemple.submittedByUserId },
          });
        }

        return {
          updated: savedTemple,
          aartisList: activeAartis,
          servicesList,
          statusTransition: transition,
          submitterUser,
          finalRemarks: savedTemple.verificationRemarks,
        };
      },
      );

    if (statusTransition && this.emailService) {
      if (!submitterUser || !submitterUser.email || !submitterUser.email.trim()) {
        this.logger.warn(
          `Temple ${updated.id} (${updated.name}) verification status updated to ${statusTransition}, but submitting user ${updated.submittedByUserId} has no valid email address; skipping email delivery.`,
        );
      } else {
        const submitterEmail = submitterUser.email.trim();
        const submitterName =
          [submitterUser.firstName, submitterUser.lastName].filter(Boolean).join(' ') ||
          'Purohit';
        try {
          if (statusTransition === 'APPROVED') {
            await this.emailService.sendTempleApprovalEmail({
              email: submitterEmail,
              templeName: updated.name,
              purohitName: submitterName,
              remarks: finalRemarks,
            });
          } else if (statusTransition === 'REJECTED') {
            await this.emailService.sendTempleRejectionEmail({
              email: submitterEmail,
              templeName: updated.name,
              rejectionReason: finalRemarks || '',
              purohitName: submitterName,
            });
          }
        } catch (error: unknown) {
          const errMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to deliver temple verification ${statusTransition} email for temple ${updated.id} to submitter ${updated.submittedByUserId}: ${errMessage}`,
          );
        }
      }
    }

    if (statusTransition && updated.submittedByUserId && this.notificationService) {
      try {
        let notifTitle = 'Temple Verification Status Updated';
        let notifMessage = `Your temple "${updated.name}" verification status has been updated to ${updated.verificationStatus}.`;

        if (statusTransition === 'APPROVED') {
          notifTitle = 'Temple Submission Approved';
          notifMessage = finalRemarks
            ? `Your temple "${updated.name}" has been approved. Remarks: ${finalRemarks}`
            : `Your temple "${updated.name}" has been approved by the administrator.`;
        } else if (statusTransition === 'REJECTED') {
          notifTitle = 'Temple Submission Rejected';
          notifMessage = finalRemarks
            ? `Your temple "${updated.name}" submission has been rejected. Reason: ${finalRemarks}`
            : `Your temple "${updated.name}" submission has been rejected by the administrator.`;
        } else if (statusTransition === 'PENDING') {
          notifTitle = 'Temple Verification Pending';
          notifMessage = `Your temple "${updated.name}" verification status is set to pending admin review.`;
        }

        await this.notificationService.createNotification(
          updated.submittedByUserId,
          notifTitle,
          notifMessage,
          NOTIFICATION_TYPE.SYSTEM,
          updated.id,
          'TEMPLE',
          true,
          {
            templeId: updated.id,
            templeName: updated.name,
            verificationStatus: updated.verificationStatus,
            verificationRemarks: finalRemarks,
            action: 'TEMPLE_VERIFICATION_STATUS_CHANGED',
          },
        );

        if (typeof this.notificationService.getGateway === 'function') {
          this.notificationService.getGateway()?.notifyUser(
            updated.submittedByUserId,
            'temple:verification_status',
            {
              templeId: updated.id,
              templeName: updated.name,
              verificationStatus: updated.verificationStatus,
              verificationRemarks: finalRemarks,
            },
          );
        }
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to notify submitter ${updated.submittedByUserId} of verification status update for temple ${updated.id}: ${errMessage}`,
        );
      }
    }

    let downloadUrl: string | null = null;
    if (updated.imageUrl) {
      try {
        downloadUrl = await this.s3Service.getDownloadUrl(updated.imageUrl);
      } catch {
        downloadUrl = updated.imageUrl;
      }
    }

    let trustDocDownloadUrl: string | null = null;
    if (updated.trustDocUrl) {
      try {
        trustDocDownloadUrl = await this.s3Service.getDownloadUrl(updated.trustDocUrl);
      } catch {
        trustDocDownloadUrl = updated.trustDocUrl;
      }
    }

    let deityPhotoDownloadUrl: string | null = null;
    if (updated.deityPhotoUrl) {
      try {
        deityPhotoDownloadUrl = await this.s3Service.getDownloadUrl(updated.deityPhotoUrl);
      } catch {
        deityPhotoDownloadUrl = updated.deityPhotoUrl;
      }
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Temple updated successfully',
      data: this.formatTempleResponse(
        updated,
        downloadUrl,
        dto.services !== undefined ? servicesList : undefined,
        aartisList,
        trustDocDownloadUrl,
        deityPhotoDownloadUrl,
      ),
    };
  }

  async deleteTemple(id: number, userOrAdminId?: User | number) {
    const user = typeof userOrAdminId === 'object' ? userOrAdminId : undefined;
    const actorId = user ? user.id : (typeof userOrAdminId === 'number' ? userOrAdminId : undefined);
    const isPurohit = user?.role === USER_ROLE.PUROHIT;
    const isAdmin = !user || user.role === USER_ROLE.ADMIN;

    if (!isAdmin && !isPurohit) {
      throw new ForbiddenException('You are not authorized to delete temples');
    }

    await this.runInTransaction(async (manager: EntityManager) => {
      const templeRepo = manager.getRepository(Temple);
      const aartiRepo = manager.getRepository(TempleAarti);

      const temple = await templeRepo.findOne({
        where: { id },
        withDeleted: true,
      });

      if (!temple || temple.deletedAt) {
        throw new NotFoundException(`Temple with id ${id} not found`);
      }

      if (isPurohit) {
        if (temple.submittedByUserId !== user!.id) {
          throw new ForbiddenException('You are not authorized to delete this temple');
        }
      }

      const now = new Date();
      temple.deletedAt = now;
      await templeRepo.save(temple);

      await aartiRepo.update(
        { templeId: id, deletedAt: IsNull() },
        { deletedAt: now },
      );

      await this.auditLogService.createAuditLog({
        actorId,
        actorType: ACTOR_TYPE.USER,
        actorRole: isPurohit ? USER_ROLE.PUROHIT : USER_ROLE.ADMIN,
        module: AUDIT_MODULE.TEMPLE,
        entity: 'Temple',
        entityId: String(id),
        action: 'TEMPLE_DELETED',
        message: isPurohit
          ? `Purohit soft deleted temple ${temple.name}.`
          : `Admin soft deleted temple ${temple.name}.`,
        oldValue: {
          name: temple.name,
          isActive: temple.isActive,
          submittedByUserId: temple.submittedByUserId,
          verificationStatus: temple.verificationStatus,
        },
        newValue: {
          deleted: true,
        },
      });
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Temple deleted successfully',
    };
  }

  // TODO: Updated getTemples to accept userOrIsAdmin (User | boolean) instead of only boolean isAdmin to support role-based temple visibility
  /*
  async getTemples(query: GetTemplesQueryDto, isAdmin: boolean = false) {
    const result = await this.templeRepository.findAllTemples(query, isAdmin);
  */
  async getTemples(query: GetTemplesQueryDto, userOrIsAdmin: User | boolean = false) {
    const isAdmin =
      typeof userOrIsAdmin === 'boolean'
        ? userOrIsAdmin
        : userOrIsAdmin?.role === USER_ROLE.ADMIN;

    const user = typeof userOrIsAdmin === 'object' ? userOrIsAdmin : undefined;
    const isPurohit = user?.role === USER_ROLE.PUROHIT;

    const result = await this.templeRepository.findAllTemples(query, userOrIsAdmin);

    let shouldIncludeAartis = false;
    if (
      query.includeAartis !== undefined &&
      query.includeAartis !== null &&
      (query.includeAartis as unknown) !== ''
    ) {
      if (typeof query.includeAartis === 'boolean') {
        shouldIncludeAartis = query.includeAartis;
      } else {
        const str = String(query.includeAartis).trim().toLowerCase();
        if (str === 'true' || str === '1') shouldIncludeAartis = true;
      }
    }
    let aartisByTempleId: Map<number, TempleAarti[]> | undefined = undefined;
    if (
      shouldIncludeAartis &&
      result.data.length > 0 &&
      typeof this.templeRepository.findAartisByTempleIds === 'function'
    ) {
      const templeIds = result.data.map((t) => t.id);
      const allAartis = await this.templeRepository.findAartisByTempleIds(templeIds, isAdmin || isPurohit);
      aartisByTempleId = new Map();
      for (const aarti of allAartis) {
        const list = aartisByTempleId.get(aarti.templeId) || [];
        list.push(aarti);
        aartisByTempleId.set(aarti.templeId, list);
      }
    }

    let servicesByTempleId: Map<number, Record<string, unknown>[]> | undefined = undefined;
    if (
      result.data.length > 0 &&
      typeof this.templeRepository.findActiveServicesByTempleIds === 'function'
    ) {
      const templeIds = result.data.map((t) => t.id).filter(Boolean);
      if (templeIds.length > 0) {
        try {
          const allServices = await this.templeRepository.findActiveServicesByTempleIds(templeIds);
          if (allServices && allServices.length > 0) {
            const serviceIds = allServices.map((s) => s.id).filter(Boolean);
            const featuresByServiceId = new Map<number, ServiceFeature[]>();
            if (
              serviceIds.length > 0 &&
              typeof this.templeRepository.findFeaturesByServiceIds === 'function'
            ) {
              try {
                const allFeatures = await this.templeRepository.findFeaturesByServiceIds(serviceIds);
                for (const feat of allFeatures || []) {
                  const list = featuresByServiceId.get(feat.serviceId) || [];
                  list.push(feat);
                  featuresByServiceId.set(feat.serviceId, list);
                }
              } catch (e) {
                console.error('Failed to load service features for temple services in getTemples:', e);
              }
            }

            servicesByTempleId = new Map();
            for (const s of allServices) {
              const enriched = await this.enrichFullServiceDetails(
                s,
                featuresByServiceId.get(s.id) || [],
              );
              const tId = s.templeId!;
              const list = servicesByTempleId.get(tId) || [];
              list.push(enriched);
              servicesByTempleId.set(tId, list);
            }
          }
        } catch (e) {
          console.error('Failed to load services for temples in getTemples:', e);
        }
      }
    }

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
        let trustDocDownloadUrl: string | null = null;
        if (item.trustDocUrl) {
          try {
            trustDocDownloadUrl = await this.s3Service.getDownloadUrl(item.trustDocUrl);
          } catch {
            trustDocDownloadUrl = item.trustDocUrl;
          }
        }
        let deityPhotoDownloadUrl: string | null = null;
        if (item.deityPhotoUrl) {
          try {
            deityPhotoDownloadUrl = await this.s3Service.getDownloadUrl(item.deityPhotoUrl);
          } catch {
            deityPhotoDownloadUrl = item.deityPhotoUrl;
          }
        }
        const aartis = shouldIncludeAartis && aartisByTempleId ? (aartisByTempleId.get(item.id) || []) : undefined;
        const services = servicesByTempleId ? (servicesByTempleId.get(item.id) || []) : [];
        return this.formatTempleResponse(
          item,
          downloadUrl,
          services,
          aartis,
          trustDocDownloadUrl,
          deityPhotoDownloadUrl,
        );
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

  async getTempleById(id: number, userOrIsAdmin: User | boolean = false) {
    const isAdmin =
      typeof userOrIsAdmin === 'boolean'
        ? userOrIsAdmin
        : userOrIsAdmin?.role === USER_ROLE.ADMIN;

    const temple = await this.templeRepository.findTempleById(id, userOrIsAdmin);

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

    let trustDocDownloadUrl: string | null = null;
    if (temple.trustDocUrl) {
      try {
        trustDocDownloadUrl = await this.s3Service.getDownloadUrl(temple.trustDocUrl);
      } catch {
        trustDocDownloadUrl = temple.trustDocUrl;
      }
    }

    let deityPhotoDownloadUrl: string | null = null;
    if (temple.deityPhotoUrl) {
      try {
        deityPhotoDownloadUrl = await this.s3Service.getDownloadUrl(temple.deityPhotoUrl);
      } catch {
        deityPhotoDownloadUrl = temple.deityPhotoUrl;
      }
    }

    const services = await this.templeRepository.findActiveServicesByTempleId(id);

    let enrichedServices: Record<string, unknown>[] | undefined = undefined;
    if (services !== undefined && Array.isArray(services)) {
      const serviceIds = services.map((s) => s.id).filter(Boolean);
      const featuresByServiceId = new Map<number, ServiceFeature[]>();
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

      // TODO: Previous shallow 10-field mapping kept for reference:
      /*
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
          const plans = this.enrichServicePlansAndToken(
            s as unknown as Record<string, unknown>,
            features,
          );

          return {
            id: s.id,
            name: s.name,
            slug: s.slug ?? null,
            description: s.description ?? null,
            metaTitle: s.metaTitle ?? null,
            metaDescription: s.metaDescription ?? null,
            iconUrl: s.iconUrl ?? null,
            iconDownloadurl: iconDownloadurl ?? null,
            isActive: s.isActive,
            plans: plans ?? null,
          };
        }),
      );
      */
      enrichedServices = await Promise.all(
        services.map(async (s) => {
          const features = featuresByServiceId.get(s.id) || [];
          return this.enrichFullServiceDetails(s, features);
        }),
      );
    }

    const user = typeof userOrIsAdmin === 'object' ? userOrIsAdmin : undefined;
    const isPurohit = user?.role === USER_ROLE.PUROHIT;

    const aartis = typeof this.templeRepository.findAartisByTempleId === 'function'
      ? await this.templeRepository.findAartisByTempleId(id, isAdmin || isPurohit)
      : [];

    return {
      success: true,
      statusCode: 200,
      message: 'Temple fetched successfully',
      data: this.formatTempleResponse(
        temple,
        downloadUrl,
        enrichedServices,
        aartis,
        trustDocDownloadUrl,
        deityPhotoDownloadUrl,
      ),
    };
  }
}
