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
import { CategoryRepository } from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import { AuditLogService, generateUniqueSlug } from '@poojawala/common';
import { ACTOR_TYPE, AUDIT_MODULE, CATEGORY_TYPE, USER_ROLE } from '@poojawala/entities';

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly s3Service: S3Service,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Validates that a given categoryId references a valid PRODUCT-type category.
   * Throws BadRequestException with a clear message if validation fails.
   */
  private async validateProductCategory(categoryId: number): Promise<void> {
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

    if (category.categoryType !== CATEGORY_TYPE.PRODUCT) {
      throw new BadRequestException(
        `Category with id ${categoryId} is a SERVICE category. Products must be assigned to PRODUCT-type categories only.`,
      );
    }
  }

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

      // Validate the provided PRODUCT category if supplied
      if (dto.categoryId !== undefined && dto.categoryId !== null) {
        await this.validateProductCategory(dto.categoryId);
      }

      let imageUrl: string | undefined = dto.imageUrl?.trim() || undefined;

      if (files?.image?.length) {
        imageUrl = await this.s3Service.uploadFileHelper(
          adminId,
          'product',
          files.image,
        );
      }

      const slug = await generateUniqueSlug(this.productRepository, dto.name.trim());

      const product = this.productRepository.create({
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || undefined,
        metaTitle: dto.metaTitle?.trim() || null,
        metaDescription: dto.metaDescription?.trim() || null,
        imageUrl,
        price: dto.price,
        pricingUnit: dto.pricingUnit,
        quantity,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        categoryId: dto.categoryId ?? null,
      });

      const saved = await this.productRepository.save(product);

      // Re-fetch with category relation for the response
      const savedWithCategory = await this.productRepository.findOne({
        where: { id: saved.id },
        relations: ['category'],
      });

      if (savedWithCategory?.imageUrl) {
        try {
          savedWithCategory.imageUrl = await this.s3Service.getDownloadUrl(savedWithCategory.imageUrl);
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
          categoryId: saved.categoryId,
        },
      });

      return {
        success: true,
        message: 'Product created successfully',
        data: savedWithCategory ?? saved,
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
    if (query.categoryType !== undefined && query.categoryType !== null) {
      if (query.categoryType !== CATEGORY_TYPE.PRODUCT) {
        throw new BadRequestException(
          'categoryType must be PRODUCT when querying products. SERVICE category type is not allowed.',
        );
      }
    }

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

      const data = result.data.map((item) => ({
        ...item,
        metaTitle: item.metaTitle ?? null,
        metaDescription: item.metaDescription ?? null,
        category: item.category
          ? {
              ...item.category,
              metaTitle: item.category.metaTitle ?? null,
              metaDescription: item.category.metaDescription ?? null,
            }
          : null,
      }));

      return {
        success: true,
        message: 'Products fetched successfully',
        data,
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
      relations: ['category'],
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
      data: {
        ...product,
        metaTitle: product.metaTitle ?? null,
        metaDescription: product.metaDescription ?? null,
        category: product.category
          ? {
              ...product.category,
              metaTitle: product.category.metaTitle ?? null,
              metaDescription: product.category.metaDescription ?? null,
            }
          : null,
      },
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
        relations: ['category'],
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

      // Validate the new category if provided
      if (dto.categoryId !== undefined && dto.categoryId !== null) {
        await this.validateProductCategory(dto.categoryId);
      }

      const oldValue = {
        name: product.name,
        description: product.description,
        price: product.price,
        pricingUnit: product.pricingUnit,
        quantity: product.quantity,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        categoryId: product.categoryId,
      };

      if (dto.name !== undefined) {
        const trimmedName = dto.name.trim();
        if (trimmedName !== product.name) {
          product.name = trimmedName;
          product.slug = await generateUniqueSlug(this.productRepository, trimmedName, product.id);
        }
      } else if (!product.slug) {
        product.slug = await generateUniqueSlug(this.productRepository, product.name, product.id);
      }
      if (dto.description !== undefined) product.description = dto.description.trim();
      if (dto.metaTitle !== undefined) product.metaTitle = dto.metaTitle?.trim() || null;
      if (dto.metaDescription !== undefined) product.metaDescription = dto.metaDescription?.trim() || null;
      if (dto.price !== undefined) product.price = dto.price;
      if (dto.pricingUnit !== undefined) product.pricingUnit = dto.pricingUnit;
      if (dto.quantity !== undefined) product.quantity = dto.quantity;
      if (dto.isActive !== undefined) product.isActive = dto.isActive;
      if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;

      const oldImageUrl = product.imageUrl;
      const imageFile = files?.image;
      const hasImageFile = Boolean(
        imageFile && imageFile.length > 0 && imageFile[0]?.buffer && imageFile[0].buffer.length > 0,
      );

      if (hasImageFile && imageFile) {
        product.imageUrl = await this.s3Service.uploadFileHelper(
          product.id,
          'product',
          imageFile,
        );
        if (
          oldImageUrl &&
          oldImageUrl !== product.imageUrl &&
          typeof this.s3Service?.isVercelBlobUrl === 'function' &&
          this.s3Service.isVercelBlobUrl(oldImageUrl) &&
          typeof this.s3Service?.deleteByUrl === 'function'
        ) {
          await this.s3Service.deleteByUrl(oldImageUrl);
        }
      } else if (typeof dto.imageUrl === 'string' && dto.imageUrl.trim().length > 0) {
        product.imageUrl = dto.imageUrl.trim();
      } else {
        product.imageUrl = null as any;
        if (
          oldImageUrl &&
          typeof this.s3Service?.isVercelBlobUrl === 'function' &&
          this.s3Service.isVercelBlobUrl(oldImageUrl) &&
          typeof this.s3Service?.deleteByUrl === 'function'
        ) {
          await this.s3Service.deleteByUrl(oldImageUrl);
        }
      }

      const updated = await this.productRepository.save(product);

      // Re-fetch with category relation for the response
      const updatedWithCategory = await this.productRepository.findOne({
        where: { id: updated.id },
        relations: ['category'],
      });

      if (updatedWithCategory?.imageUrl) {
        try {
          updatedWithCategory.imageUrl = await this.s3Service.getDownloadUrl(
            updatedWithCategory.imageUrl,
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
          categoryId: updated.categoryId,
        },
      });

      return {
        success: true,
        message: 'Product updated successfully',
        data: updatedWithCategory ?? updated,
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
