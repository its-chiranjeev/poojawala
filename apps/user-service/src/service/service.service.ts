import { CreateServiceDto } from '@likemyproduct/dtos/service/create.service.dto';
import { GetServicesQueryDto } from '@likemyproduct/dtos/service/get.services.query.dto';
import { UpdateServiceDto } from '@likemyproduct/dtos/service/update.service.dto';
import { ServiceRepository } from '@likemyproduct/repositories';
import { S3Service } from '@likemyproduct/s3';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Injectable()
export class ServiceService {
  constructor(
    private readonly serviceRepository: ServiceRepository,
    private readonly s3Service: S3Service,
  ) {}

  async findAllServices(query: GetServicesQueryDto) {
    const result = await this.serviceRepository.findAllServices(query);

    return {
      success: true,
      message: 'Services fetched successfully',
      data: result.data,
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
  ) {
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

    const service = this.serviceRepository.create({
      ...dto,
      iconUrl,
      isActive: dto.isActive ?? true,
    });

    const savedService = await this.serviceRepository.save(service);

    return {
      success: true,
      message: 'Service created successfully',
      data: savedService,
    };
  }

  async updateService(
    id: number,
    dto: UpdateServiceDto,
    files: {
      icon?: Express.Multer.File[];
    },
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

    // Upload new icon if provided
    if (files?.icon?.length) {
      const folderName = dto.slug ?? service.slug;

      service.iconUrl = await this.s3Service.uploadFileHelper(
        folderName,
        'icon',
        files.icon,
      );
    }

    Object.assign(service, dto);

    const updated = await this.serviceRepository.save(service);

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

    return {
      success: true,
      message: 'Service fetched successfully',
      data: service,
    };
  }

  async deleteService(id: number) {
    const service = await this.serviceRepository.findOne({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    try {
      await this.serviceRepository.remove(service);

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
}
