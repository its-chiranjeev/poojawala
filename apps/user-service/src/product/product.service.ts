import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateProductDto,
  GetProductsQueryDto,
  UpdateProductDto,
} from '@poojawala/dtos';
import { ProductRepository } from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import { AuditLogService } from '@poojawala/common';
import { ACTOR_TYPE, AUDIT_MODULE, USER_ROLE } from '@poojawala/entities';

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly s3Service: S3Service,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createProduct(
    dto: CreateProductDto,
    files: {
      image?: Express.Multer.File[];
    },
    adminId: number,
  ) {
    try {
      const existingName = await this.productRepository.findOne({
        where: { name: dto.name.trim() },
      });

      if (existingName) {
        throw new ConflictException('Product with same name already exists');
      }

      if (dto.price < 0) {
        throw new BadRequestException('Price cannot be negative');
      }

      const quantity = dto.quantity ?? 0;

      if (quantity < 0) {
        throw new BadRequestException('Quantity cannot be negative');
      }

      let imageUrl: string | undefined = dto.imageUrl?.trim() || undefined;

      if (files?.image?.length) {
        imageUrl = await this.s3Service.uploadFileHelper(
          adminId,
          'product',
          files.image,
        );
      }

      const product = this.productRepository.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        imageUrl,
        price: dto.price,
        pricingUnit: dto.pricingUnit,
        quantity,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      });

      const saved = await this.productRepository.save(product);

      if (saved.imageUrl) {
        try {
          saved.imageUrl = await this.s3Service.getDownloadUrl(saved.imageUrl);
        } catch {
          // Keep raw imageUrl if not an S3 key
        }
      }

      await this.auditLogService.createAuditLog({
        actorId: adminId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.PRODUCT,
        entity: 'Product',
        entityId: String(saved.id),
        action: 'PRODUCT_CREATED',
        message: `Admin created new product ${saved.name}.`,
        oldValue: undefined,
        newValue: {
          name: saved.name,
          price: saved.price,
          pricingUnit: saved.pricingUnit,
          quantity: saved.quantity,
          isActive: saved.isActive,
        },
      });

      return {
        success: true,
        message: 'Product created successfully',
        data: saved,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMsg =
        error instanceof Error ? error.stack : JSON.stringify(error);
      throw new InternalServerErrorException(
        `createProduct failed: ${errorMsg}`,
      );
    }
  }

  async getAllProducts(query: GetProductsQueryDto) {
    try {
      const result = await this.productRepository.findAllProducts(query);

      for (const item of result.data) {
        if (item.imageUrl) {
          try {
            item.imageUrl = await this.s3Service.getDownloadUrl(item.imageUrl);
          } catch {
            // Keep raw imageUrl if not an S3 key
          }
        }
      }

      return {
        success: true,
        message: 'Products fetched successfully',
        data: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `getAllProducts failed: ${error.message || error}`,
      );
    }
  }

  async getProductById(id: number) {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.imageUrl) {
      try {
        product.imageUrl = await this.s3Service.getDownloadUrl(
          product.imageUrl,
        );
      } catch {
        // Keep raw imageUrl
      }
    }

    return {
      success: true,
      message: 'Product fetched successfully',
      data: product,
    };
  }

  async updateProduct(
    id: number,
    dto: UpdateProductDto,
    files: {
      image?: Express.Multer.File[];
    },
    adminId: number,
  ) {
    try {
      const product = await this.productRepository.findOne({
        where: { id },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (dto.name && dto.name.trim() !== product.name) {
        const existingName = await this.productRepository.findOne({
          where: { name: dto.name.trim() },
        });

        if (existingName && existingName.id !== id) {
          throw new ConflictException('Product with this name already exists');
        }
      }

      if (dto.price !== undefined && dto.price < 0) {
        throw new BadRequestException('Price cannot be negative');
      }

      if (dto.quantity !== undefined && dto.quantity < 0) {
        throw new BadRequestException('Quantity cannot be negative');
      }

      const oldValue = {
        name: product.name,
        description: product.description,
        price: product.price,
        pricingUnit: product.pricingUnit,
        quantity: product.quantity,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
      };

      if (dto.name !== undefined) product.name = dto.name.trim();
      if (dto.description !== undefined) product.description = dto.description.trim();
      if (dto.price !== undefined) product.price = dto.price;
      if (dto.pricingUnit !== undefined) product.pricingUnit = dto.pricingUnit;
      if (dto.quantity !== undefined) product.quantity = dto.quantity;
      if (dto.isActive !== undefined) product.isActive = dto.isActive;

      if (files?.image?.length) {
        product.imageUrl = await this.s3Service.uploadFileHelper(
          product.id,
          'product',
          files.image,
        );
      } else if (dto.imageUrl !== undefined) {
        product.imageUrl = dto.imageUrl ? dto.imageUrl.trim() : undefined;
      }

      const updated = await this.productRepository.save(product);

      if (updated.imageUrl) {
        try {
          updated.imageUrl = await this.s3Service.getDownloadUrl(
            updated.imageUrl,
          );
        } catch {
          // Keep raw imageUrl
        }
      }

      await this.auditLogService.createAuditLog({
        actorId: adminId,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.PRODUCT,
        entity: 'Product',
        entityId: String(updated.id),
        action: 'PRODUCT_UPDATED',
        message: `Admin updated product ${updated.name}.`,
        oldValue,
        newValue: {
          name: updated.name,
          price: updated.price,
          pricingUnit: updated.pricingUnit,
          quantity: updated.quantity,
          isActive: updated.isActive,
        },
      });

      return {
        success: true,
        message: 'Product updated successfully',
        data: updated,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMsg =
        error instanceof Error ? error.stack : JSON.stringify(error);
      throw new InternalServerErrorException(
        `updateProduct failed: ${errorMsg}`,
      );
    }
  }

  async updateProductStatus(id: number, isActive: boolean, adminId: number) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const oldStatus = product.isActive;
    product.isActive = isActive;
    const updated = await this.productRepository.save(product);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.PRODUCT,
      entity: 'Product',
      entityId: String(updated.id),
      action: 'PRODUCT_STATUS_UPDATED',
      message: `Admin updated product status of ${updated.name} to ${isActive}.`,
      oldValue: { isActive: oldStatus },
      newValue: { isActive },
    });

    return {
      success: true,
      message: 'Product status updated successfully',
      data: updated,
    };
  }

  async deleteProduct(id: number, adminId: number) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.productRepository.softDelete(id);

    await this.auditLogService.createAuditLog({
      actorId: adminId,
      actorType: ACTOR_TYPE.USER,
      actorRole: USER_ROLE.ADMIN,
      module: AUDIT_MODULE.PRODUCT,
      entity: 'Product',
      entityId: String(id),
      action: 'PRODUCT_DELETED',
      message: `Admin soft deleted product ${product.name}.`,
      oldValue: { name: product.name, isActive: product.isActive },
      newValue: { deleted: true },
    });

    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }
}
