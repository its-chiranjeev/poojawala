import { Test, TestingModule } from '@nestjs/testing';
import { ServiceService } from './service.service';
import {
  ServiceRepository,
  CategoryRepository,
  PurohitServiceRepository,
  PurohitProfileRepository,
  TempleRepository,
  ServiceFeatureRepository,
} from '@poojawala/repositories';
import { S3Service } from '@poojawala/s3';
import { AuditLogService } from '@poojawala/common';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateServiceDto } from '@poojawala/dtos/service/create.service.dto';
import { UpdateServiceDto } from '@poojawala/dtos/service/update.service.dto';
import { Temple, Service } from '@poojawala/entities';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('ServiceService - Temple ↔ Service Integration (Part 2)', () => {
  let service: ServiceService;
  let mockServiceRepo: any;
  let mockCategoryRepo: any;
  let mockTempleRepo: any;
  let mockS3Service: any;
  let mockPurohitServiceRepo: any;
  let mockPurohitProfileRepo: any;
  let mockAuditLogService: any;
  let mockServiceFeatureRepo: any;

  const sampleTemple: Temple = {
    id: 10,
    name: 'Shri Hanuman Mandir',
    description: 'Ancient temple',
    imageUrl: 'https://storage.poojawala.com/temple-10.jpg',
    address: 'Sector 62',
    city: 'Noida',
    state: 'Uttar Pradesh',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  const sampleDeletedTemple: Temple = {
    id: 99,
    name: 'Demolished Mandir',
    description: 'Deleted',
    imageUrl: null,
    address: null,
    city: 'Noida',
    state: 'UP',
    isActive: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: new Date('2026-02-01'),
  };

  const sampleInactiveTemple: Temple = {
    id: 50,
    name: 'Inactive Mandir',
    description: 'Closed for renovation',
    imageUrl: null,
    address: null,
    city: 'Noida',
    state: 'UP',
    isActive: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  const sampleServiceWithTemple: Service = {
    id: 101,
    name: 'Hanuman Puja',
    slug: 'hanuman-puja',
    description: 'Puja at mandir',
    templeId: 10,
    temple: sampleTemple,
    cities: [],
    languages: [],
    benefits: [],
    purohitCarryItems: [],
    iconUrl: 'https://storage.poojawala.com/icon.png',
    minPrice: 500,
    maxPrice: 1500,
    plans: {
      basic: { price: 500 },
      standard: { price: 1000 },
    },
    tokenPercentage: 30,
    commissionPercentage: 10,
    durationMinutes: 60,
    requiresVenue: false,
    isActive: true,
    isGlobal: true,
    isUpcomingFestival: false,
    purohitServices: [],
    bookings: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const sampleIndependentService: Service = {
    id: 102,
    name: 'Satyanarayan Katha',
    slug: null,
    description: 'Katha at home',
    templeId: null,
    temple: null,
    cities: [],
    languages: [],
    benefits: [],
    purohitCarryItems: [],
    iconUrl: undefined,
    minPrice: 800,
    maxPrice: 2000,
    plans: {
      basic: { price: 800 },
      standard: { price: 1500 },
    },
    tokenPercentage: 30,
    commissionPercentage: 10,
    durationMinutes: 90,
    requiresVenue: false,
    isActive: true,
    isGlobal: true,
    isUpcomingFestival: false,
    purohitServices: [],
    bookings: [],
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
  };

  beforeEach(async () => {
    mockServiceRepo = {
      create: jest.fn((data) => ({ ...data, id: 101 })),
      save: jest.fn(async (entity) => ({ ...entity, id: entity.id || 101 })),
      findOne: jest.fn(),
      findAllServices: jest.fn(),
      findById: jest.fn(),
    };

    mockCategoryRepo = {
      findOne: jest.fn(),
    };

    mockTempleRepo = {
      findOne: jest.fn(),
    };

    mockS3Service = {
      uploadFileHelper: jest.fn().mockResolvedValue('https://storage.poojawala.com/uploaded.png'),
      getDownloadUrl: jest.fn().mockImplementation(async (url) => url),
    };

    mockPurohitServiceRepo = {};
    mockPurohitProfileRepo = {};
    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    mockServiceFeatureRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn().mockResolvedValue([]),
      findByServiceId: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceService,
        { provide: ServiceRepository, useValue: mockServiceRepo },
        { provide: CategoryRepository, useValue: mockCategoryRepo },
        { provide: TempleRepository, useValue: mockTempleRepo },
        { provide: S3Service, useValue: mockS3Service },
        { provide: PurohitServiceRepository, useValue: mockPurohitServiceRepo },
        { provide: PurohitProfileRepository, useValue: mockPurohitProfileRepo },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: ServiceFeatureRepository, useValue: mockServiceFeatureRepo },
      ],
    }).compile();

    service = module.get<ServiceService>(ServiceService);
  });

  describe('DTO validation & transformation', () => {
    it('CreateServiceDto: allows positive integer templeId and transforms numeric strings', async () => {
      const dto = plainToInstance(CreateServiceDto, {
        name: 'Hanuman Puja',
        slug: 'hanuman-puja',
        templeId: '10',
        plans: { basic: { price: 100 }, standard: { price: 200 } },
        commissionPercentage: 10,
        durationMinutes: 60,
      });

      expect(dto.templeId).toBe(10);
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'templeId')).toHaveLength(0);
    });

    it('CreateServiceDto: allows omitting templeId and slug', async () => {
      const dto = plainToInstance(CreateServiceDto, {
        name: 'Independent Puja',
        plans: { basic: { price: 100 }, standard: { price: 200 } },
        commissionPercentage: 10,
        durationMinutes: 60,
      });

      expect(dto.templeId).toBeUndefined();
      expect(dto.slug).toBeUndefined();
      const errors = await validate(dto);
      expect(errors.filter((e) => ['templeId', 'slug'].includes(e.property))).toHaveLength(0);
    });

    it('CreateServiceDto: rejects non-numeric or non-positive templeId', async () => {
      const dto = plainToInstance(CreateServiceDto, {
        name: 'Invalid Temple Puja',
        templeId: 'not-a-number',
        plans: { basic: { price: 100 }, standard: { price: 200 } },
        commissionPercentage: 10,
        durationMinutes: 60,
      });

      const errors = await validate(dto);
      const templeIdError = errors.find((e) => e.property === 'templeId');
      expect(templeIdError).toBeDefined();
    });

    it('UpdateServiceDto: allows explicit null templeId and null slug', async () => {
      const dto = plainToInstance(UpdateServiceDto, {
        templeId: null,
        slug: null,
      });

      expect(dto.templeId).toBeNull();
      expect(dto.slug).toBeNull();
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('UpdateServiceDto: allows numeric templeId and string slug', async () => {
      const dto = plainToInstance(UpdateServiceDto, {
        templeId: 15,
        slug: 'new-slug',
      });

      expect(dto.templeId).toBe(15);
      expect(dto.slug).toBe('new-slug');
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('1. Create Service', () => {
    it('1. Create Service with Temple', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleTemple);
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Hanuman Puja',
        templeId: 10,
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const result = await service.createService(dto, {}, 1);

      expect(mockTempleRepo.findOne).toHaveBeenCalledWith({
        where: { id: 10 },
        withDeleted: true,
      });
      expect(result.success).toBe(true);
      expect(result.data.templeId).toBe(10);
      expect(result.data.temple).toEqual({ id: 10, name: 'Shri Hanuman Mandir' });
    });

    it('2. Create Service without Temple', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Satyanarayan Katha',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const result = await service.createService(dto, {}, 1);

      expect(mockTempleRepo.findOne).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.templeId).toBeNull();
      expect(result.data.temple).toBeNull();
    });

    it('3. Create Service without slug', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Puja Without Slug',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const result = await service.createService(dto, {}, 1);

      expect(mockServiceRepo.findOne).toHaveBeenCalledWith({
        where: [{ name: 'Puja Without Slug' }],
      });
      expect(result.data.slug).toBeNull();
    });

    it('4. Create Service with both Temple and slug', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleTemple);
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Hanuman Special Puja',
        slug: 'hanuman-special-puja',
        templeId: 10,
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const result = await service.createService(dto, {}, 1);

      expect(mockServiceRepo.findOne).toHaveBeenCalledWith({
        where: [{ name: 'Hanuman Special Puja' }, { slug: 'hanuman-special-puja' }],
      });
      expect(result.data.templeId).toBe(10);
      expect(result.data.slug).toBe('hanuman-special-puja');
      expect(result.data.temple).toEqual({ id: 10, name: 'Shri Hanuman Mandir' });
    });

    it('5. Create Service with invalid Temple ID throws NotFoundException', async () => {
      mockTempleRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Hanuman Puja',
        templeId: 999,
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      await expect(service.createService(dto, {}, 1)).rejects.toThrow(NotFoundException);
      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('6. Create Service with deleted Temple ID throws NotFoundException', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleDeletedTemple);

      const dto: CreateServiceDto = {
        name: 'Hanuman Puja',
        templeId: 99,
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      await expect(service.createService(dto, {}, 1)).rejects.toThrow(NotFoundException);
      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('7. Create Service with inactive Temple ID throws BadRequestException', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleInactiveTemple);

      const dto: CreateServiceDto = {
        name: 'Hanuman Puja',
        templeId: 50,
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      await expect(service.createService(dto, {}, 1)).rejects.toThrow(BadRequestException);
      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('7. Duplicate name check', async () => {
      mockServiceRepo.findOne.mockResolvedValue({ id: 1, name: 'Hanuman Puja' });

      const dto: CreateServiceDto = {
        name: 'Hanuman Puja',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      await expect(service.createService(dto, {}, 1)).rejects.toThrow(ConflictException);
    });

    it('8. Duplicate slug checked only when slug is provided', async () => {
      // Slug provided and duplicate
      mockServiceRepo.findOne.mockResolvedValue({ id: 1, slug: 'hanuman-puja' });

      const dto: CreateServiceDto = {
        name: 'New Puja Name',
        slug: 'hanuman-puja',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      await expect(service.createService(dto, {}, 1)).rejects.toThrow(ConflictException);
    });

    it('9. Multiple Services with no Temple allowed', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto1: CreateServiceDto = {
        name: 'Puja 1',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };
      const dto2: CreateServiceDto = {
        name: 'Puja 2',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const res1 = await service.createService(dto1, {}, 1);
      const res2 = await service.createService(dto2, {}, 1);

      expect(res1.data.templeId).toBeNull();
      expect(res2.data.templeId).toBeNull();
    });

    it('10. Icon upload with slug uses slug as upload key', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Puja With Icon',
        slug: 'puja-icon-slug',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const mockFile = [{ originalname: 'icon.png' }] as any;
      await service.createService(dto, { icon: mockFile }, 1);

      expect(mockS3Service.uploadFileHelper).toHaveBeenCalledWith(
        'puja-icon-slug',
        'icon',
        mockFile,
      );
    });

    it('11. Icon upload without slug uses safe identifier without passing undefined', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);

      const dto: CreateServiceDto = {
        name: 'Puja Without Slug',
        plans: { basic: { price: 500 }, standard: { price: 1000 } },
        commissionPercentage: 10,
        durationMinutes: 60,
        requiresVenue: false,
      };

      const mockFile = [{ originalname: 'icon.png' }] as any;
      await service.createService(dto, { icon: mockFile }, 42);

      expect(mockS3Service.uploadFileHelper).toHaveBeenCalledWith(
        42,
        'icon',
        mockFile,
      );
    });
  });

  describe('2. Update Service', () => {
    it('12. Assign Temple to existing Service', async () => {
      const existing = { ...sampleIndependentService };
      mockServiceRepo.findOne.mockResolvedValue(existing);
      mockTempleRepo.findOne.mockResolvedValue(sampleTemple);

      const dto: UpdateServiceDto = {
        templeId: 10,
      };

      const result = await service.updateService(102, dto, {}, 1);

      expect(mockTempleRepo.findOne).toHaveBeenCalledWith({
        where: { id: 10 },
        withDeleted: true,
      });
      expect(result.data.templeId).toBe(10);
      expect(result.data.temple).toEqual({ id: 10, name: 'Shri Hanuman Mandir' });
    });

    it('13. Change Temple', async () => {
      const existing = { ...sampleServiceWithTemple, templeId: 10 };
      const newTemple: Temple = { ...sampleTemple, id: 15, name: 'Shri Ram Mandir' };
      mockServiceRepo.findOne.mockResolvedValue(existing);
      mockTempleRepo.findOne.mockResolvedValue(newTemple);

      const dto: UpdateServiceDto = {
        templeId: 15,
      };

      const result = await service.updateService(101, dto, {}, 1);

      expect(result.data.templeId).toBe(15);
      expect(result.data.temple).toEqual({ id: 15, name: 'Shri Ram Mandir' });
    });

    it('14. Remove Temple using templeId: null', async () => {
      const existing = { ...sampleServiceWithTemple, templeId: 10 };
      mockServiceRepo.findOne.mockResolvedValue(existing);

      const dto: UpdateServiceDto = {
        templeId: null,
      };

      const result = await service.updateService(101, dto, {}, 1);

      expect(mockTempleRepo.findOne).not.toHaveBeenCalled();
      expect(result.data.templeId).toBeNull();
      expect(result.data.temple).toBeNull();
    });

    it('15. Update Service without sending templeId leaves relationship unchanged', async () => {
      const existing = { ...sampleServiceWithTemple, templeId: 10 };
      mockServiceRepo.findOne.mockResolvedValue(existing);
      mockTempleRepo.findOne.mockResolvedValue(sampleTemple);

      const dto: UpdateServiceDto = {
        name: 'Updated Puja Name',
      };

      const result = await service.updateService(101, dto, {}, 1);

      expect(result.data.templeId).toBe(10);
      expect(result.data.temple).toEqual({ id: 10, name: 'Shri Hanuman Mandir' });
    });

    it('16. Remove or change optional slug', async () => {
      const existing = { ...sampleServiceWithTemple, slug: 'old-slug' };
      mockServiceRepo.findOne.mockResolvedValue(existing);

      // Remove slug
      const removeDto: UpdateServiceDto = { slug: null };
      const resRemove = await service.updateService(101, removeDto, {}, 1);
      expect(resRemove.data.slug).toBeNull();

      // Change slug
      const changeDto: UpdateServiceDto = { slug: 'new-valid-slug' };
      const resChange = await service.updateService(101, changeDto, {}, 1);
      expect(resChange.data.slug).toBe('new-valid-slug');
    });

    it('17. Update with invalid Temple ID throws NotFoundException', async () => {
      const existing = { ...sampleIndependentService };
      mockServiceRepo.findOne.mockResolvedValue(existing);
      mockTempleRepo.findOne.mockResolvedValue(null);

      const dto: UpdateServiceDto = {
        templeId: 999,
      };

      await expect(service.updateService(102, dto, {}, 1)).rejects.toThrow(NotFoundException);
    });

    it('18. Update with deleted Temple ID throws NotFoundException', async () => {
      const existing = { ...sampleIndependentService };
      mockServiceRepo.findOne.mockResolvedValue(existing);
      mockTempleRepo.findOne.mockResolvedValue(sampleDeletedTemple);

      const dto: UpdateServiceDto = {
        templeId: 99,
      };

      await expect(service.updateService(102, dto, {}, 1)).rejects.toThrow(NotFoundException);
    });

    it('16. Update with inactive Temple ID throws BadRequestException', async () => {
      const existing = { ...sampleIndependentService };
      mockServiceRepo.findOne.mockResolvedValue(existing);
      mockTempleRepo.findOne.mockResolvedValue(sampleInactiveTemple);

      const dto: UpdateServiceDto = {
        templeId: 50,
      };

      await expect(service.updateService(102, dto, {}, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. GET Service', () => {
    it('19. Get Service with Temple returns lightweight Temple info', async () => {
      mockServiceRepo.findById.mockResolvedValue({
        ...sampleServiceWithTemple,
        temple: { id: 10, name: 'Shri Hanuman Mandir' },
      });

      const result = await service.findServiceById(101);

      expect(result.success).toBe(true);
      expect(result.data.templeId).toBe(10);
      expect(result.data.temple).toEqual({ id: 10, name: 'Shri Hanuman Mandir' });
    });

    it('20. Get Service without Temple returns temple: null', async () => {
      mockServiceRepo.findById.mockResolvedValue({
        ...sampleIndependentService,
        temple: null,
      });

      const result = await service.findServiceById(102);

      expect(result.success).toBe(true);
      expect(result.data.templeId).toBeNull();
      expect(result.data.temple).toBeNull();
    });

    it('21-25. findAllServices returns lightweight Temple info, pagination, and preserves search', async () => {
      mockServiceRepo.findAllServices.mockResolvedValue({
        data: [
          {
            ...sampleServiceWithTemple,
            temple: { id: 10, name: 'Shri Hanuman Mandir' },
          },
          {
            ...sampleIndependentService,
            temple: null,
          },
        ],
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });

      const result = await service.findAllServices({ page: 1, limit: 10, search: 'Puja' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].templeId).toBe(10);
      expect(result.data[0].temple).toEqual({ id: 10, name: 'Shri Hanuman Mandir' });
      expect(result.data[1].templeId).toBeNull();
      expect(result.data[1].temple).toBeNull();
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('2. findAllServices with valid active templeId validates temple and returns services', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleTemple);
      mockServiceRepo.findAllServices.mockResolvedValue({
        data: [
          {
            ...sampleServiceWithTemple,
            temple: { id: 10, name: 'Shri Hanuman Mandir' },
          },
        ],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      const result = await service.findAllServices({ page: 1, limit: 10, templeId: 10 });

      expect(mockTempleRepo.findOne).toHaveBeenCalledWith({
        where: { id: 10 },
        withDeleted: true,
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].templeId).toBe(10);
    });

    it('4. findAllServices with invalid templeId throws NotFoundException', async () => {
      mockTempleRepo.findOne.mockResolvedValue(null);

      await expect(service.findAllServices({ templeId: 999999 })).rejects.toThrow(NotFoundException);
      expect(mockServiceRepo.findAllServices).not.toHaveBeenCalled();
    });

    it('5. findAllServices with deleted templeId throws NotFoundException', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleDeletedTemple);

      await expect(service.findAllServices({ templeId: 99 })).rejects.toThrow(NotFoundException);
      expect(mockServiceRepo.findAllServices).not.toHaveBeenCalled();
    });

    it('6. findAllServices with inactive templeId throws NotFoundException', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleInactiveTemple);

      await expect(service.findAllServices({ templeId: 50 })).rejects.toThrow(NotFoundException);
      expect(mockServiceRepo.findAllServices).not.toHaveBeenCalled();
    });

    it('8. findAllServices for temple with no services returns empty list', async () => {
      mockTempleRepo.findOne.mockResolvedValue(sampleTemple);
      mockServiceRepo.findAllServices.mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });

      const result = await service.findAllServices({ templeId: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
