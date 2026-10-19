import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductRepository, CategoryRepository } from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import { AuditLogService } from '@poojawala/common';
import { PRODUCT_PRICING_UNIT, Product, ServiceCategory, CATEGORY_TYPE } from '@poojawala/entities';

describe('ProductService - Standardized Image Handling on PATCH /products/:id', () => {
  let service: ProductService;
  let mockProductRepo: any;
  let mockCategoryRepo: any;
  let mockS3Service: any;
  let mockAuditLogService: any;

  const sampleCategory: ServiceCategory = {
    id: 1,
    name: 'Puja Samagri',
    description: 'Samagri category',
    categoryType: CATEGORY_TYPE.PRODUCT,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as any;

  const sampleProduct: Product = {
    id: 10,
    name: 'Gangajal 500ml',
    description: 'Pure Holy Water',
    price: 150,
    pricingUnit: PRODUCT_PRICING_UNIT.PIECE,
    quantity: 50,
    imageUrl: 'https://storage.poojawala.com/old-gangajal.jpg',
    isActive: true,
    categoryId: 1,
    category: sampleCategory,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as any;

  beforeEach(async () => {
    mockProductRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (p: any) => ({ ...p, id: p.id || 10 })),
      create: jest.fn((p: any) => ({ ...p, id: 10 })),
    };

    mockCategoryRepo = {
      findOne: jest.fn().mockResolvedValue(sampleCategory),
    };

    mockS3Service = {
      uploadFileHelper: jest.fn().mockResolvedValue('https://storage.poojawala.com/new-product.webp'),
      getDownloadUrl: jest.fn().mockImplementation(async (url) => url),
      isVercelBlobUrl: jest.fn().mockReturnValue(false),
      deleteByUrl: jest.fn().mockResolvedValue(true),
    };

    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: mockProductRepo },
        { provide: CategoryRepository, useValue: mockCategoryRepo },
        { provide: S3Service, useValue: mockS3Service },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  describe('updateProduct (PATCH /products/:id)', () => {
    it('Case 1a: should save uploaded image metadata when a valid image file is provided', async () => {
      const existing = { ...sampleProduct };
      mockProductRepo.findOne.mockResolvedValue(existing);

      const mockFile = [{
        buffer: Buffer.from('test-image'),
        mimetype: 'image/webp',
        originalname: 'gangajal.webp',
      }] as Express.Multer.File[];

      const result = await service.updateProduct(10, {}, { image: mockFile }, 99);

      expect(mockS3Service.uploadFileHelper).toHaveBeenCalledWith(10, 'product', mockFile);
      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://storage.poojawala.com/new-product.webp' }),
      );
      expect(result.data.imageUrl).toBe('https://storage.poojawala.com/new-product.webp');
    });

    it('Case 1b: should save valid image URL when provided in DTO without file upload', async () => {
      const existing = { ...sampleProduct };
      mockProductRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateProduct(
        10,
        { imageUrl: 'https://images.poojawala.com/cdn-gangajal.jpg' },
        { image: undefined },
        99,
      );

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://images.poojawala.com/cdn-gangajal.jpg' }),
      );
      expect(result.data.imageUrl).toBe('https://images.poojawala.com/cdn-gangajal.jpg');
    });

    it('Case 2: should set imageUrl to null when image key is absent from payload', async () => {
      const existing = { ...sampleProduct, imageUrl: 'https://storage.poojawala.com/gangajal-old.jpg' };
      mockProductRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateProduct(10, { price: 200 }, { image: undefined }, 99);

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 200,
          imageUrl: null,
        }),
      );
      expect(result.data.imageUrl).toBeNull();
    });

    it('Case 3: should set imageUrl to null when image key is explicitly null or empty', async () => {
      const existing = { ...sampleProduct, imageUrl: 'https://storage.poojawala.com/gangajal-old.jpg' };
      mockProductRepo.findOne.mockResolvedValue(existing);

      const resultNull = await service.updateProduct(
        10,
        { imageUrl: null as any },
        { image: undefined },
        99,
      );
      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: null }),
      );
      expect(resultNull.data.imageUrl).toBeNull();

      const resultEmpty = await service.updateProduct(
        10,
        { imageUrl: '   ' },
        { image: undefined },
        99,
      );
      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: null }),
      );
      expect(resultEmpty.data.imageUrl).toBeNull();
    });

    it('should replace existing image URL and delete old Vercel blob URL when new image is uploaded', async () => {
      const existing = {
        ...sampleProduct,
        imageUrl: 'https://blob.vercel-storage.com/old-blob.jpg',
      };
      mockProductRepo.findOne.mockResolvedValue(existing);
      mockS3Service.isVercelBlobUrl.mockReturnValue(true);
      mockS3Service.uploadFileHelper.mockResolvedValue('https://storage.poojawala.com/brand-new.jpg');

      const mockFile = [{
        buffer: Buffer.from('test-image'),
        mimetype: 'image/jpeg',
        originalname: 'new.jpg',
      }] as Express.Multer.File[];

      await service.updateProduct(10, {}, { image: mockFile }, 99);

      expect(mockS3Service.deleteByUrl).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-blob.jpg');
      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://storage.poojawala.com/brand-new.jpg' }),
      );
    });

    it('should clear existing image URL to null and delete old Vercel blob URL when no image is provided', async () => {
      const existing = {
        ...sampleProduct,
        imageUrl: 'https://blob.vercel-storage.com/old-blob.jpg',
      };
      mockProductRepo.findOne.mockResolvedValue(existing);
      mockS3Service.isVercelBlobUrl.mockReturnValue(true);

      await service.updateProduct(10, {}, { image: undefined }, 99);

      expect(mockS3Service.deleteByUrl).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-blob.jpg');
      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: null }),
      );
    });

    it('should preserve other product fields when image is omitted and set to null', async () => {
      const existing = {
        ...sampleProduct,
        name: 'Brass Diya Large',
        description: 'Handcrafted Diya',
        price: 499,
        quantity: 25,
        pricingUnit: PRODUCT_PRICING_UNIT.PIECE,
        isActive: true,
        categoryId: 1,
        imageUrl: 'https://storage.poojawala.com/cleared.jpg',
      };
      mockProductRepo.findOne.mockResolvedValue(existing);

      await service.updateProduct(10, {}, { image: undefined }, 99);

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Brass Diya Large',
          description: 'Handcrafted Diya',
          price: 499,
          quantity: 25,
          pricingUnit: PRODUCT_PRICING_UNIT.PIECE,
          isActive: true,
          categoryId: 1,
          imageUrl: null,
        }),
      );
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateProduct(999, {}, { image: undefined }, 99),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
