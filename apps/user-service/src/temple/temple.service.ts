import { Injectable, NotFoundException } from '@nestjs/common';
import { TempleRepository } from '@poojawala/repositories';
import { CreateTempleDto, UpdateTempleDto, GetTemplesQueryDto } from '@poojawala/dtos';
import { Temple, ACTOR_TYPE, USER_ROLE, AUDIT_MODULE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
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
      description: temple.description,
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
        isActive: s.isActive,
        plans: s.plans ?? null,
      }));
    }

    return formatted;
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

    const temple = this.templeRepository.create({
      name: dto.name.trim(),
      description: dto.description ?? null,
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
      imageUrl: temple.imageUrl,
      address: temple.address,
      city: temple.city,
      state: temple.state,
      isActive: temple.isActive,
    };

    if (dto.name !== undefined) {
      temple.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      temple.description = dto.description;
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

    const fileToUpload = files?.imageUrl || files?.image;
    if (fileToUpload?.length) {
      temple.imageUrl =
        (await this.s3Service.uploadFileHelper(
          adminId || 'temple',
          'temple',
          fileToUpload,
        )) || null;
    } else if (dto.imageUrl !== undefined) {
      temple.imageUrl = dto.imageUrl;
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

    return {
      success: true,
      statusCode: 200,
      message: 'Temple fetched successfully',
      data: this.formatTempleResponse(temple, downloadUrl, services),
    };
  }
}
