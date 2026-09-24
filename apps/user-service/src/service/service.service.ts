import {
  CreateServiceDto,
  CreatePurohitServiceDto,
  PurohitServiceItemDto,
} from '@poojawala/dtos/service/create.service.dto';
import { GetServicesQueryDto } from '@poojawala/dtos/service/get.services.query.dto';
import {
  UpdateServiceDto,
  UpdatePurohitServiceDto,
} from '@poojawala/dtos/service/update.service.dto';
import {
  ServiceRepository,
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
import { USER_ROLE, AUDIT_MODULE, ACTOR_TYPE, PUROHIT_VERIFICATION_STATUS } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';

// 177 87

@Injectable()
export class ServiceService {
  constructor(
    private readonly serviceRepository: ServiceRepository,
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

      if (dto.minPrice > dto.maxPrice) {
        throw new BadRequestException(
          'Minimum price cannot be greater than maximum price',
        );
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

      // TODO: Original createService instantiation kept for reference:
      /*
      const service = this.serviceRepository.create({
        ...dto,
        iconUrl,
        isActive: dto.isActive ?? true,
        isUpcomingFestival: dto.isUpcomingFestival ?? false,
      });
      */

      const service = this.serviceRepository.create({
        ...dto,
        cities: dto.cities ?? [],
        languages: dto.languages ?? [],
        benefits: dto.benefits ?? [],
        iconUrl,
        isActive: dto.isActive ?? true,
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

    const minPrice = dto.minPrice ?? Number(service.minPrice);
    const maxPrice = dto.maxPrice ?? Number(service.maxPrice);

    if (minPrice > maxPrice) {
      throw new BadRequestException(
        'Minimum price cannot be greater than maximum price',
      );
    }

    // TODO: Previous Object.assign(service, dto) kept for reference:
    /*
    Object.assign(service, dto);
    */
    const oldCities = service.cities;
    const oldLanguages = service.languages;
    const oldBenefits = service.benefits;

    Object.assign(service, dto);

    if (dto.cities !== undefined) {
      service.cities = dto.cities ?? [];
    }
    if (dto.languages !== undefined) {
      service.languages = dto.languages ?? [];
    }
    if (dto.benefits !== undefined) {
      service.benefits = dto.benefits ?? [];
    }

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
      },
      newValue: updatedFields,
    });

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
      serviceDto.isOnline = Boolean(item.isOnline);
      serviceDto.isOffline = Boolean(item.isOffline);
      serviceDto.onlinePrice = item.onlinePrice ? Number(item.onlinePrice) : undefined;
      serviceDto.offlinePrice = item.offlinePrice ? Number(item.offlinePrice) : undefined;
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
          isOnline: serviceDto.isOnline ?? existing.isOnline,
          isOffline: serviceDto.isOffline ?? existing.isOffline,
          onlinePrice: serviceDto.onlinePrice ?? existing.onlinePrice,
          offlinePrice: serviceDto.offlinePrice ?? existing.offlinePrice,
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
              isOnline: serviceDto.isOnline ?? softDeleted.isOnline,
              isOffline: serviceDto.isOffline ?? softDeleted.isOffline,
              onlinePrice: serviceDto.onlinePrice ?? softDeleted.onlinePrice,
              offlinePrice: serviceDto.offlinePrice ?? softDeleted.offlinePrice,
              durationMinutes: serviceDto.durationMinutes ?? softDeleted.durationMinutes,
              isActive: serviceDto.isActive ?? true,
            });
            const restored = await this.PurohitServiceRepository.findById(softDeleted.id);
            if (restored) added.push(restored);
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
    console.log(dto);
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
        'You are not authorized to update this service',
      );
    }

    Object.assign(purohitService, dto);

    const updatedService =
      await this.PurohitServiceRepository.save(purohitService);

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

    return {
      success: true,
      message: 'Purohit service fetched successfully',
      data: purohitService,
    };
  }
}
