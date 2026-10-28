import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TempleService } from './temple.service';
import { TempleRepository } from '@poojawala/repositories';
import { Temple, TempleAarti, ACTOR_TYPE, USER_ROLE, AUDIT_MODULE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { S3Service } from '@poojawala/s3';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateTempleDto,
  UpdateTempleDto,
  GetTemplesQueryDto,
  CreateTempleAartiDto,
  UpdateTempleAartiDto,
} from '@poojawala/dtos';
import { DataSource } from 'typeorm';

describe('TempleService', () => {
  let service: TempleService;
  let mockTempleRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAllTemples: jest.Mock;
    findTempleById: jest.Mock;
    findActiveServicesByTempleId: jest.Mock;
    findAartisByTempleId: jest.Mock;
    findAartisByTempleIds: jest.Mock;
    manager?: any;
  };
  let mockAartiRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock;
  };
  let mockAuditLogService: {
    createAuditLog: jest.Mock;
  };
  let mockS3Service: {
    uploadFileHelper: jest.Mock;
    getDownloadUrl: jest.Mock;
  };

  const sampleActiveTemple: Temple = {
    id: 1,
    name: 'Shri Hanuman Mandir',
    description: 'Ancient and sacred temple',
    imageUrl: 'https://images.poojawala.com/temple1.jpg',
    address: 'Sector 12, Main Road',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  const sampleInactiveTemple: Temple = {
    id: 2,
    name: 'Shri Shiv Mandir',
    description: 'Renovating temple',
    imageUrl: null,
    address: null,
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    isActive: false,
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
  };

  const sampleDeletedTemple: Temple = {
    id: 3,
    name: 'Old Mandir',
    description: 'Demolished/relocated',
    imageUrl: null,
    address: null,
    city: 'Delhi',
    state: 'Delhi',
    isActive: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    deletedAt: new Date('2025-06-01'),
  };

  beforeEach(async () => {
    mockTempleRepo = {
      create: jest.fn((data) => ({ ...data, id: 1 })),
      save: jest.fn(async (entity) => ({ ...entity, id: entity.id || 1 })),
      findOne: jest.fn(),
      findAllTemples: jest.fn(),
      findTempleById: jest.fn(),
      findActiveServicesByTempleId: jest.fn().mockResolvedValue([]),
      findAartisByTempleId: jest.fn().mockResolvedValue([]),
      findAartisByTempleIds: jest.fn().mockResolvedValue([]),
    };

    mockAartiRepo = {
      create: jest.fn((data) => ({ ...data, id: 10 })),
      save: jest.fn(async (entity) => ({ ...entity, id: entity.id || 10 })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockManager = {
      getRepository: jest.fn((entity) => {
        if (entity === TempleAarti) {
          return mockAartiRepo;
        }
        return mockTempleRepo;
      }),
    };

    mockDataSource = {
      transaction: jest.fn(async (cb) => cb(mockManager)),
    };

    mockTempleRepo.manager = mockDataSource;

    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };

    mockS3Service = {
      uploadFileHelper: jest.fn().mockResolvedValue('https://storage.poojawala.com/uploaded.jpg'),
      getDownloadUrl: jest.fn().mockImplementation(async (url) => url),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempleService,
        {
          provide: TempleRepository,
          useValue: mockTempleRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
      ],
    }).compile();

    service = module.get<TempleService>(TempleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CREATE TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Create Temple', () => {
    it('1. should create a valid temple with all fields and audit log', async () => {
      const dto: CreateTempleDto = {
        name: 'Shri Ram Mandir',
        description: 'Magnificent temple',
        imageUrl: 'https://images.poojawala.com/ram.jpg',
        address: 'Ayodhya Dham',
        city: 'Ayodhya',
        state: 'Uttar Pradesh',
        isActive: true,
      };

      const result = await service.createTemple(dto, undefined, 99);

      expect(mockTempleRepo.create).toHaveBeenCalledWith({
        name: 'Shri Ram Mandir',
        slug: 'shri-ram-mandir',
        description: 'Magnificent temple',
        metaTitle: null,
        metaDescription: null,
        imageUrl: 'https://images.poojawala.com/ram.jpg',
        address: 'Ayodhya Dham',
        city: 'Ayodhya',
        state: 'Uttar Pradesh',
        primaryDeity: null,
        trustName: null,
        contactName: null,
        phone: null,
        email: null,
        openingTime: null,
        closingTime: null,
        trustRegNo: null,
        trustDocUrl: null,
        deityPhotoUrl: null,
        isActive: true,
      });
      expect(mockTempleRepo.save).toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith({
        actorId: 99,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.TEMPLE,
        entity: 'Temple',
        entityId: '1',
        action: 'TEMPLE_CREATED',
        message: 'Admin created new temple Shri Ram Mandir.',
        oldValue: undefined,
        newValue: expect.objectContaining({
          name: 'Shri Ram Mandir',
          isActive: true,
        }),
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Shri Ram Mandir');
      expect(result.data.isActive).toBe(true);
    });

    it('should upload image file if provided in files parameter', async () => {
      const dto: CreateTempleDto = {
        name: 'Shri Ram Mandir',
      };
      const files: any = {
        imageUrl: [{ originalname: 'mandir.jpg', buffer: Buffer.from('test') }],
      };

      const result = await service.createTemple(dto, files, 99);

      expect(mockS3Service.uploadFileHelper).toHaveBeenCalledWith(
        99,
        'temple',
        files.imageUrl,
      );
      expect(mockTempleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://storage.poojawala.com/uploaded.jpg',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('2. should create a temple without optional fields', async () => {
      const dto: CreateTempleDto = {
        name: 'Simple Mandir',
      };

      const result = await service.createTemple(dto, undefined, 99);

      expect(mockTempleRepo.create).toHaveBeenCalledWith({
        name: 'Simple Mandir',
        slug: 'simple-mandir',
        description: null,
        metaTitle: null,
        metaDescription: null,
        imageUrl: null,
        address: null,
        city: null,
        state: null,
        primaryDeity: null,
        trustName: null,
        contactName: null,
        phone: null,
        email: null,
        openingTime: null,
        closingTime: null,
        trustRegNo: null,
        trustDocUrl: null,
        deityPhotoUrl: null,
        isActive: true,
      });
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Simple Mandir');
    });

    it('3. should reject empty name in CreateTempleDto validation', async () => {
      const dto = plainToInstance(CreateTempleDto, {
        name: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const nameError = errors.find((e) => e.property === 'name');
      expect(nameError).toBeDefined();
    });

    it('4. should reject whitespace-only name in CreateTempleDto validation', async () => {
      const dto = plainToInstance(CreateTempleDto, {
        name: '     ',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const nameError = errors.find((e) => e.property === 'name');
      expect(nameError).toBeDefined();
    });

    it('5. should trim whitespace from name before saving and default isActive to true', async () => {
      const dto: CreateTempleDto = {
        name: '   Shri Krishna Mandir   ',
      };

      const result = await service.createTemple(dto, undefined, 99);

      expect(mockTempleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Shri Krishna Mandir',
          isActive: true,
        }),
      );
      expect(result.data.name).toBe('Shri Krishna Mandir');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. READ TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Read Temples', () => {
    it('6. should GET all temples with pagination', async () => {
      const query: GetTemplesQueryDto = { page: 1, limit: 10 };
      mockTempleRepo.findAllTemples.mockResolvedValue({
        data: [sampleActiveTemple],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      const result = await service.getTemples(query, false);

      expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(query, false);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].downloadUrl).toBe(sampleActiveTemple.imageUrl);
      expect(result.pagination.total).toBe(1);
    });

    it('6b. should pass isActive filter to findAllTemples for true and false', async () => {
      mockTempleRepo.findAllTemples.mockResolvedValue({
        data: [sampleInactiveTemple],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      const queryFalse: GetTemplesQueryDto = { page: 1, limit: 10, isActive: false };
      const resultFalse = await service.getTemples(queryFalse, true);

      expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(queryFalse, true);
      expect(resultFalse.success).toBe(true);

      const queryTrue: GetTemplesQueryDto = { page: 1, limit: 10, isActive: true };
      await service.getTemples(queryTrue, false);
      expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(queryTrue, false);
    });

    it('6c. should properly transform isActive in GetTemplesQueryDto from string to boolean', () => {
      const dtoFalse = plainToInstance(GetTemplesQueryDto, { isActive: 'false' });
      expect(dtoFalse.isActive).toBe(false);

      const dtoTrue = plainToInstance(GetTemplesQueryDto, { isActive: 'true' });
      expect(dtoTrue.isActive).toBe(true);

      const dto0 = plainToInstance(GetTemplesQueryDto, { isActive: '0' });
      expect(dto0.isActive).toBe(false);

      const dto1 = plainToInstance(GetTemplesQueryDto, { isActive: '1' });
      expect(dto1.isActive).toBe(true);

      const dtoEmpty = plainToInstance(GetTemplesQueryDto, { isActive: '' });
      expect(dtoEmpty.isActive).toBeUndefined();

      const dtoNone = plainToInstance(GetTemplesQueryDto, {});
      expect(dtoNone.isActive).toBeUndefined();
    });

    it('7. should GET temple by ID with downloadUrl', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(sampleActiveTemple);

      const result = await service.getTempleById(1, false);

      expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(1, false);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
      expect(result.data.downloadUrl).toBe(sampleActiveTemple.imageUrl);
    });

    it('8. should verify inactive temple behavior for public vs admin GET', async () => {
      mockTempleRepo.findTempleById.mockResolvedValueOnce(null);
      await expect(service.getTempleById(2, false)).rejects.toThrow(NotFoundException);

      mockTempleRepo.findTempleById.mockResolvedValueOnce(sampleInactiveTemple);
      const adminResult = await service.getTempleById(2, true);
      expect(adminResult.success).toBe(true);
      expect(adminResult.data.isActive).toBe(false);
    });

    it('9. should verify deleted temple is excluded from GET by ID', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(null);

      await expect(service.getTempleById(3, false)).rejects.toThrow(NotFoundException);
      await expect(service.getTempleById(3, true)).rejects.toThrow(NotFoundException);
    });

    it('10. should return 404 for non-existing temple ID', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(null);

      await expect(service.getTempleById(999, false)).rejects.toThrow(NotFoundException);
    });

    it('14-16, 19-20. should return shallow active services on temple detail and avoid circular references', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(sampleActiveTemple);
      mockTempleRepo.findActiveServicesByTempleId.mockResolvedValue([
        {
          id: 101,
          name: 'Kalka Mata Special Puja',
          slug: 'kalka-mata-special-puja',
          description: 'Special devotional puja',
          isActive: true,
        },
        {
          id: 102,
          name: 'Kalka Ji Mandir Sankalp Puja',
          slug: null,
          description: 'Sankalp puja',
          isActive: true,
        },
      ]);

      const result = await service.getTempleById(1, false);

      expect(result.success).toBe(true);
      expect(result.data.services).toHaveLength(2);
      expect(result.data.services[0]).toEqual({
        id: 101,
        name: 'Kalka Mata Special Puja',
        slug: 'kalka-mata-special-puja',
        description: 'Special devotional puja',
        metaTitle: null,
        metaDescription: null,
        iconUrl: null,
        iconDownloadurl: null,
        isActive: true,
        plans: null,
      });
      expect(result.data.services[0].temple).toBeUndefined(); // shallow, not circular!
      expect(result.data.services[1]).toEqual({
        id: 102,
        name: 'Kalka Ji Mandir Sankalp Puja',
        slug: null,
        description: 'Sankalp puja',
        metaTitle: null,
        metaDescription: null,
        iconUrl: null,
        iconDownloadurl: null,
        isActive: true,
        plans: null,
      });
    });

    it('16. should return empty services array when temple has no services', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(sampleActiveTemple);
      mockTempleRepo.findActiveServicesByTempleId.mockResolvedValue([]);

      const result = await service.getTempleById(1, false);

      expect(result.success).toBe(true);
      expect(result.data.services).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. UPDATE TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Update Temple', () => {
    it('11. should update temple name and log audit log', async () => {
      const existing = { ...sampleActiveTemple };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const dto: UpdateTempleDto = { name: 'Updated Mandir Name' };
      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Mandir Name' }),
      );
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 99,
          action: 'TEMPLE_UPDATED',
          entityId: '1',
          newValue: expect.objectContaining({ name: 'Updated Mandir Name' }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated Mandir Name');
    });

    it('12. should update optional fields', async () => {
      const existing = { ...sampleActiveTemple };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const dto: UpdateTempleDto = {
        city: 'Mathura',
        state: 'Uttar Pradesh',
        address: 'Near Yamuna Ghat',
      };
      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Mathura',
          state: 'Uttar Pradesh',
          address: 'Near Yamuna Ghat',
        }),
      );
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('13. should update isActive status', async () => {
      const existing = { ...sampleActiveTemple, isActive: true };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const dto: UpdateTempleDto = { isActive: false };
      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalled();
      expect(result.data.isActive).toBe(false);
    });

    it('14. should verify partial update works (unspecified fields remain unchanged)', async () => {
      const existing = { ...sampleActiveTemple, city: 'Ghaziabad', address: 'Old Address' };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const dto: UpdateTempleDto = { address: 'New Address' };
      await service.updateTemple(1, dto, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: sampleActiveTemple.name,
          city: 'Ghaziabad',
          address: 'New Address',
        }),
      );
    });

    it('15. should verify updating a deleted temple throws 404 and does not restore it', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleDeletedTemple });

      const dto: UpdateTempleDto = { name: 'Trying to update deleted', isActive: true };
      await expect(service.updateTemple(3, dto, undefined, 99)).rejects.toThrow(NotFoundException);
      expect(mockTempleRepo.save).not.toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).not.toHaveBeenCalled();
    });

    it('should reject id/deletedAt modification via DTO validation', async () => {
      const dto = plainToInstance(UpdateTempleDto, {
        id: 999,
        deletedAt: null,
      });
      expect((dto as any).id).toBe(999);
      const existing = { ...sampleActiveTemple };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      await service.updateTemple(1, dto, undefined, 99);
      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deletedAt: null }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DELETE TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Delete Temple (Soft Delete)', () => {
    it('16-18. should soft delete existing temple and log audit log', async () => {
      const existing = { ...sampleActiveTemple, deletedAt: null };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const result = await service.deleteTemple(1, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          deletedAt: expect.any(Date),
        }),
      );
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith({
        actorId: 99,
        actorType: ACTOR_TYPE.USER,
        actorRole: USER_ROLE.ADMIN,
        module: AUDIT_MODULE.TEMPLE,
        entity: 'Temple',
        entityId: '1',
        action: 'TEMPLE_DELETED',
        message: 'Admin soft deleted temple Shri Hanuman Mandir.',
        oldValue: {
          name: 'Shri Hanuman Mandir',
          isActive: true,
        },
        newValue: {
          deleted: true,
        },
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Temple deleted successfully');
    });

    it('21. should throw 404 when attempting to delete an already deleted temple', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleDeletedTemple });

      await expect(service.deleteTemple(3, 99)).rejects.toThrow(NotFoundException);
      expect(mockTempleRepo.save).not.toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).not.toHaveBeenCalled();
    });

    it('should throw 404 when deleting a non-existent temple', async () => {
      mockTempleRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteTemple(999, 99)).rejects.toThrow(NotFoundException);
      expect(mockTempleRepo.save).not.toHaveBeenCalled();
      expect(mockAuditLogService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. STANDARDIZED IMAGE HANDLING TESTS (PATCH /temples/:id)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Standardized Image Handling on PATCH /temples/:id', () => {
    it('Case 1a: should save uploaded image metadata when a valid image file is provided', async () => {
      const existing = { ...sampleActiveTemple, imageUrl: 'https://storage.poojawala.com/old.jpg' };
      mockTempleRepo.findOne.mockResolvedValue(existing);
      mockS3Service.uploadFileHelper.mockResolvedValue('https://storage.poojawala.com/new-temple.webp');

      const mockFile = [{
        buffer: Buffer.from('test-image'),
        mimetype: 'image/webp',
        originalname: 'temple.webp',
      }] as Express.Multer.File[];

      const result = await service.updateTemple(1, {}, { image: mockFile }, 99);

      expect(mockS3Service.uploadFileHelper).toHaveBeenCalledWith(99, 'temple', mockFile);
      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://storage.poojawala.com/new-temple.webp' }),
      );
      expect(result.data.imageUrl).toBe('https://storage.poojawala.com/new-temple.webp');
    });

    it('Case 1b: should save valid image URL when provided in DTO without file upload', async () => {
      const existing = { ...sampleActiveTemple, imageUrl: 'https://storage.poojawala.com/old.jpg' };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateTemple(
        1,
        { imageUrl: 'https://images.poojawala.com/temple-cdn.jpg' },
        undefined,
        99,
      );

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://images.poojawala.com/temple-cdn.jpg' }),
      );
      expect(result.data.imageUrl).toBe('https://images.poojawala.com/temple-cdn.jpg');
    });

    it('Case 2: should set imageUrl to null when image key is absent from payload', async () => {
      const existing = { ...sampleActiveTemple, imageUrl: 'https://storage.poojawala.com/existing.jpg' };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateTemple(1, { name: 'Renamed Mandir' }, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Renamed Mandir',
          imageUrl: null,
        }),
      );
      expect(result.data.imageUrl).toBeNull();
    });

    it('Case 3: should set imageUrl to null when image key is explicitly null or empty', async () => {
      const existing = { ...sampleActiveTemple, imageUrl: 'https://storage.poojawala.com/existing.jpg' };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      const resultNull = await service.updateTemple(1, { imageUrl: null as any }, undefined, 99);
      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: null }),
      );
      expect(resultNull.data.imageUrl).toBeNull();

      const resultEmpty = await service.updateTemple(1, { imageUrl: '   ' }, undefined, 99);
      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: null }),
      );
      expect(resultEmpty.data.imageUrl).toBeNull();
    });

    it('should preserve other temple fields when image is omitted and set to null', async () => {
      const existing = {
        ...sampleActiveTemple,
        name: 'Preserved Mandir',
        description: 'Preserved Description',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        address: 'Ghat Road',
        isActive: true,
        imageUrl: 'https://storage.poojawala.com/will-clear.jpg',
      };
      mockTempleRepo.findOne.mockResolvedValue(existing);

      await service.updateTemple(1, {}, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Preserved Mandir',
          description: 'Preserved Description',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          address: 'Ghat Road',
          isActive: true,
          imageUrl: null,
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TEMPLE AARTI INTEGRATION TESTS (PHASE 4)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Temple Aarti Integration (Phase 4)', () => {
    it('1. should create a Temple without aartis', async () => {
      const dto: CreateTempleDto = {
        name: 'Mandir Without Aartis',
      };

      const result = await service.createTemple(dto, undefined, 99);

      expect(mockTempleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mandir Without Aartis' }),
      );
      expect(mockAartiRepo.create).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Mandir Without Aartis');
      expect(result.data.aartis).toBeUndefined();
    });

    it('2. should create a Temple with multiple aartis in the same transaction', async () => {
      const dto: CreateTempleDto = {
        name: 'Mandir With Aartis',
        aartis: [
          { name: 'Mangala Aarti', time: '05:30:00' },
          { name: 'Sandhya Aarti', time: '18:45:00', isActive: true },
        ],
      };

      const result = await service.createTemple(dto, undefined, 99);

      expect(mockTempleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mandir With Aartis' }),
      );
      expect(mockAartiRepo.create).toHaveBeenCalledTimes(2);
      expect(mockAartiRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          templeId: 1,
          name: 'Mangala Aarti',
          time: '05:30:00',
        }),
      );
      expect(mockAartiRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          templeId: 1,
          name: 'Sandhya Aarti',
          time: '18:45:00',
          isActive: true,
        }),
      );
      expect(mockAartiRepo.save).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.data.aartis).toHaveLength(2);
      expect(result.data.aartis![0].name).toBe('Mangala Aarti');
      expect(result.data.aartis![1].name).toBe('Sandhya Aarti');
    });

    it('3. should rollback entire transaction when one aarti is invalid during create', async () => {
      mockAartiRepo.save.mockRejectedValueOnce(new Error('Aarti creation failed'));

      const dto: CreateTempleDto = {
        name: 'Mandir Rollback Test',
        aartis: [{ name: 'Faulty Aarti', time: '06:00:00' }],
      };

      await expect(service.createTemple(dto, undefined, 99)).rejects.toThrow(
        'Aarti creation failed',
      );
    });

    it('3b. should reject empty aarti name in createTemple', async () => {
      const dto: CreateTempleDto = {
        name: 'Mandir With Empty Aarti',
        aartis: [{ name: '   ' }],
      };

      await expect(service.createTemple(dto, undefined, 99)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('4. should retrieve Temple details with aartis and exclude deleted aartis', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(sampleActiveTemple);
      mockTempleRepo.findAartisByTempleId.mockResolvedValue([
        {
          id: 101,
          templeId: 1,
          name: 'Morning Aarti',
          slug: 'morning-aarti',
          time: '06:00:00',
          isActive: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          deletedAt: null,
        },
        {
          id: 102,
          templeId: 1,
          name: 'Evening Aarti',
          slug: 'evening-aarti',
          time: '19:00:00',
          isActive: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          deletedAt: null,
        },
      ]);

      const result = await service.getTempleById(1, false);

      expect(mockTempleRepo.findAartisByTempleId).toHaveBeenCalledWith(1, false);
      expect(result.success).toBe(true);
      expect(result.data.aartis).toHaveLength(2);
      expect(result.data.aartis![0]).toEqual({
        id: 101,
        templeId: 1,
        name: 'Morning Aarti',
        slug: 'morning-aarti',
        time: '06:00:00',
        isActive: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('5. should update Temple fields without changing aartis when aartis is omitted', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });

      const dto: UpdateTempleDto = {
        name: 'Renamed Mandir Only',
      };

      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed Mandir Only' }),
      );
      expect(mockAartiRepo.save).not.toHaveBeenCalled();
      expect(mockAartiRepo.create).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Renamed Mandir Only');
      expect(result.data.aartis).toBeUndefined();
    });

    it('6. should update an existing aarti by ID when updating Temple', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      const existingAarti: TempleAarti = {
        id: 10,
        templeId: 1,
        temple: sampleActiveTemple,
        name: 'Old Aarti Name',
        slug: 'old-aarti-name',
        time: '05:00:00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      mockAartiRepo.find.mockResolvedValue([existingAarti]);

      const dto: UpdateTempleDto = {
        aartis: [
          {
            id: 10,
            name: 'Updated Aarti Name',
            time: '05:30:00',
            isActive: false,
          },
        ],
      };

      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockAartiRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          name: 'Updated Aarti Name',
          time: '05:30:00',
          isActive: false,
        }),
      );
      expect(result.success).toBe(true);
    });

    it('7. should add a new aarti while updating the Temple', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      mockAartiRepo.find.mockResolvedValue([]);

      const dto: UpdateTempleDto = {
        description: 'Updated description',
        aartis: [
          {
            name: 'New Afternoon Aarti',
            time: '12:00:00',
          },
        ],
      };

      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockAartiRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          templeId: 1,
          name: 'New Afternoon Aarti',
          time: '12:00:00',
          isActive: true,
        }),
      );
      expect(mockAartiRepo.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('8. should explicitly remove an aarti using soft deletion (isDeleted: true)', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      const existingAarti: TempleAarti = {
        id: 10,
        templeId: 1,
        temple: sampleActiveTemple,
        name: 'Aarti to be deleted',
        slug: 'aarti-to-be-deleted',
        time: '06:00:00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      mockAartiRepo.find.mockResolvedValueOnce([existingAarti]); // first lookup
      mockAartiRepo.find.mockResolvedValueOnce([]); // lookup after soft deletion

      const dto: UpdateTempleDto = {
        aartis: [{ id: 10, isDeleted: true }],
      };

      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockAartiRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          deletedAt: expect.any(Date),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('8b. should explicitly remove an aarti using soft deletion (delete: true)', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      const existingAarti: TempleAarti = {
        id: 11,
        templeId: 1,
        temple: sampleActiveTemple,
        name: 'Aarti with delete flag',
        slug: 'aarti-delete-flag',
        time: '06:00:00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      mockAartiRepo.find.mockResolvedValueOnce([existingAarti]);
      mockAartiRepo.find.mockResolvedValueOnce([]);

      const dto: UpdateTempleDto = {
        aartis: [{ id: 11, delete: true }],
      };

      const result = await service.updateTemple(1, dto, undefined, 99);

      expect(mockAartiRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 11,
          deletedAt: expect.any(Date),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('9. should reject an aarti ID belonging to another Temple', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      const crossTempleAarti: TempleAarti = {
        id: 99,
        templeId: 2, // belongs to temple 2, not temple 1!
        temple: sampleInactiveTemple,
        name: 'Foreign Aarti',
        slug: 'foreign-aarti',
        time: '06:00:00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      mockAartiRepo.find.mockResolvedValue([crossTempleAarti]);

      const dto: UpdateTempleDto = {
        aartis: [{ id: 99, name: 'Tampering cross-temple' }],
      };

      await expect(service.updateTemple(1, dto, undefined, 99)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('9b. should reject an aarti ID that does not exist in the database', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      mockAartiRepo.find.mockResolvedValue([]); // not found

      const dto: UpdateTempleDto = {
        aartis: [{ id: 9999, name: 'Nonexistent Aarti' }],
      };

      await expect(service.updateTemple(1, dto, undefined, 99)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('9c. should reject modifying an already deleted aarti', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      const deletedAarti: TempleAarti = {
        id: 10,
        templeId: 1,
        temple: sampleActiveTemple,
        name: 'Deleted Aarti',
        slug: 'deleted-aarti',
        time: '06:00:00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date('2026-01-01'),
      };
      mockAartiRepo.find.mockResolvedValue([deletedAarti]);

      const dto: UpdateTempleDto = {
        aartis: [{ id: 10, name: 'Reactivating deleted' }],
      };

      await expect(service.updateTemple(1, dto, undefined, 99)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('10. should verify deleted aartis are excluded from responses', async () => {
      mockTempleRepo.findTempleById.mockResolvedValue(sampleActiveTemple);
      // findAartisByTempleId only returns non-deleted aartis
      mockTempleRepo.findAartisByTempleId.mockResolvedValue([
        {
          id: 10,
          templeId: 1,
          name: 'Active Aarti',
          slug: 'active-aarti',
          time: '06:00:00',
          isActive: true,
          deletedAt: null,
        },
      ]);

      const result = await service.getTempleById(1, false);

      expect(result.data.aartis).toHaveLength(1);
      expect(result.data.aartis![0].id).toBe(10);
    });

    it('11. should soft-delete temple and all associated aartis atomically on deleteTemple', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });

      const result = await service.deleteTemple(1, 99);

      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          deletedAt: expect.any(Date),
        }),
      );
      expect(mockAartiRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ templeId: 1 }),
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Temple deleted successfully');
    });

    it('12. should verify transaction rollback on update failure', async () => {
      mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
      mockAartiRepo.find.mockRejectedValueOnce(new Error('Connection timed out'));

      const dto: UpdateTempleDto = {
        name: 'Updated Name',
        aartis: [{ id: 10, name: 'Aarti' }],
      };

      await expect(service.updateTemple(1, dto, undefined, 99)).rejects.toThrow(
        'Connection timed out',
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DTO VALIDATION TESTS
    // ─────────────────────────────────────────────────────────────────────────
    describe('Aarti DTO Validation', () => {
      it('should validate valid CreateTempleAartiDto', async () => {
        const dto = plainToInstance(CreateTempleAartiDto, {
          name: 'Bhog Aarti',
          time: '12:30:00',
          isActive: true,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should reject invalid time format in CreateTempleAartiDto', async () => {
        const dto = plainToInstance(CreateTempleAartiDto, {
          name: 'Invalid Time Aarti',
          time: '25:00', // Invalid hour
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('time');
      });

      it('should reject non-time string in CreateTempleAartiDto', async () => {
        const dto = plainToInstance(CreateTempleAartiDto, {
          name: 'Invalid Time Aarti',
          time: 'not-a-time',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('time');
      });

      it('should reject empty name in CreateTempleAartiDto', async () => {
        const dto = plainToInstance(CreateTempleAartiDto, {
          name: '   ',
          time: '07:00:00',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('name');
      });

      it('should reject malformed ID in UpdateTempleAartiDto', async () => {
        const dto = plainToInstance(UpdateTempleAartiDto, {
          id: -5,
          name: 'Negative ID Aarti',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('id');
      });

      it('should require name for new aarti in UpdateTempleAartiDto when id is absent', async () => {
        const dto = plainToInstance(UpdateTempleAartiDto, {
          time: '08:00:00',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('name');
      });

      it('should allow optional name when id and isDeleted are present in UpdateTempleAartiDto', async () => {
        const dto = plainToInstance(UpdateTempleAartiDto, {
          id: 5,
          isDeleted: true,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('should reject non-array aartis in CreateTempleDto', async () => {
        const dto = plainToInstance(CreateTempleDto, {
          name: 'Invalid Aartis Field Mandir',
          aartis: 'not-an-array' as any,
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const aartisError = errors.find((e) => e.property === 'aartis');
        expect(aartisError).toBeDefined();
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NEW TEMPLE FIELDS INTEGRATION & VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    describe('New Temple Fields Integration & Validation', () => {
      it('should create temple with all new fields and explicit slug', async () => {
        const dto: CreateTempleDto = {
          name: 'Somnath Temple',
          slug: 'somnath-jyotirlinga',
          primaryDeity: 'Lord Shiva',
          trustName: 'Shree Somnath Trust',
          contactName: 'Trust Secretary',
          phone: '+91 9876543210',
          email: 'contact@somnathtemple.org',
          openingTime: '06:00:00',
          closingTime: '21:30:00',
          trustRegNo: 'TRUST-SOM-1950',
          trustDocUrl: 'https://storage.poojawala.com/trust-doc.pdf',
          deityPhotoUrl: 'https://storage.poojawala.com/shiva.jpg',
        };

        const result = await service.createTemple(dto, undefined, 99);

        expect(mockTempleRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Somnath Temple',
            slug: 'somnath-jyotirlinga',
            primaryDeity: 'Lord Shiva',
            trustName: 'Shree Somnath Trust',
            contactName: 'Trust Secretary',
            phone: '+91 9876543210',
            email: 'contact@somnathtemple.org',
            openingTime: '06:00:00',
            closingTime: '21:30:00',
            trustRegNo: 'TRUST-SOM-1950',
            trustDocUrl: 'https://storage.poojawala.com/trust-doc.pdf',
            deityPhotoUrl: 'https://storage.poojawala.com/shiva.jpg',
          }),
        );
        expect(result.success).toBe(true);
        expect(result.data.primaryDeity).toBe('Lord Shiva');
        expect(result.data.trustName).toBe('Shree Somnath Trust');
      });

      it('should update temple with new fields and preserve omitted fields', async () => {
        const existing = {
          ...sampleActiveTemple,
          primaryDeity: 'Lord Hanuman',
          trustName: 'Initial Trust',
          email: 'old@temple.org',
        };
        mockTempleRepo.findOne.mockResolvedValue(existing);

        const dto: UpdateTempleDto = {
          primaryDeity: 'Panchamukhi Hanuman',
          openingTime: '05:00:00',
          closingTime: '22:00:00',
        };

        const result = await service.updateTemple(1, dto, undefined, 99);

        expect(mockTempleRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            primaryDeity: 'Panchamukhi Hanuman',
            trustName: 'Initial Trust', // preserved!
            email: 'old@temple.org', // preserved!
            openingTime: '05:00:00',
            closingTime: '22:00:00',
          }),
        );
        expect(result.success).toBe(true);
      });

      it('should clear optional fields when explicitly set to null or empty string', async () => {
        const existing = {
          ...sampleActiveTemple,
          primaryDeity: 'Lord Hanuman',
          trustName: 'Old Trust',
        };
        mockTempleRepo.findOne.mockResolvedValue(existing);

        const dto: UpdateTempleDto = {
          primaryDeity: '',
          trustName: null as any,
        };

        await service.updateTemple(1, dto, undefined, 99);

        expect(mockTempleRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            primaryDeity: null,
            trustName: null,
          }),
        );
      });

      it('should reject invalid email format in CreateTempleDto', async () => {
        const dto = plainToInstance(CreateTempleDto, {
          name: 'Invalid Email Mandir',
          email: 'not-an-email',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.find((e) => e.property === 'email')).toBeDefined();
      });

      it('should accept valid email in CreateTempleDto', async () => {
        const dto = plainToInstance(CreateTempleDto, {
          name: 'Valid Email Mandir',
          email: 'admin@mandir.com',
        });
        const errors = await validate(dto);
        expect(errors.find((e) => e.property === 'email')).toBeUndefined();
      });

      it('should reject invalid openingTime format in CreateTempleDto', async () => {
        const dto = plainToInstance(CreateTempleDto, {
          name: 'Invalid Time Mandir',
          openingTime: '25:00',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.find((e) => e.property === 'openingTime')).toBeDefined();
      });

      it('should reject invalid closingTime format in UpdateTempleDto', async () => {
        const dto = plainToInstance(UpdateTempleDto, {
          closingTime: '12:65',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.find((e) => e.property === 'closingTime')).toBeDefined();
      });

      it('should accept valid HH:mm and HH:mm:ss for openingTime and closingTime', async () => {
        const dto1 = plainToInstance(CreateTempleDto, {
          name: 'Valid Timings Mandir',
          openingTime: '06:00',
          closingTime: '21:30:00',
        });
        const errors1 = await validate(dto1);
        expect(errors1.find((e) => e.property === 'openingTime')).toBeUndefined();
        expect(errors1.find((e) => e.property === 'closingTime')).toBeUndefined();
      });

      it('should validate CreateTempleDto with JSON-stringified aartis (multipart form-data) without non-whitelisted errors', async () => {
        const raw = {
          name: 'Shree Somnath Jyotirlinga Temple',
          description: 'Historic temple',
          aartis: JSON.stringify([
            {
              name: 'Mangla Aarti',
              time: '07:00:00',
              isActive: true,
            },
            {
              name: 'Sandhya Aarti',
              time: '19:00:00',
              isActive: true,
            },
          ]),
        };

        const dto = plainToInstance(CreateTempleDto, raw);
        expect(dto.aartis).toBeDefined();
        expect(dto.aartis!.length).toBe(2);
        expect(dto.aartis![0]).toBeInstanceOf(CreateTempleAartiDto);

        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
        expect(errors).toHaveLength(0);
      });

      it('should validate UpdateTempleDto with JSON-stringified aartis (multipart form-data)', async () => {
        const raw = {
          aartis: JSON.stringify([
            {
              id: 1,
              name: 'Updated Aarti',
              time: '06:30:00',
              isActive: true,
            },
            {
              name: 'New Aarti',
              time: '18:00:00',
            },
          ]),
        };

        const dto = plainToInstance(UpdateTempleDto, raw);
        expect(dto.aartis).toBeDefined();
        expect(dto.aartis!.length).toBe(2);
        expect(dto.aartis![0]).toBeInstanceOf(UpdateTempleAartiDto);

        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
        expect(errors).toHaveLength(0);
      });

      it('should return all new fields in getTempleById response', async () => {
        const templeWithAllFields: Temple = {
          ...sampleActiveTemple,
          slug: 'hanuman-mandir',
          primaryDeity: 'Lord Hanuman',
          trustName: 'Hanuman Seva Trust',
          contactName: 'Mahant Ji',
          phone: '+91 9999999999',
          email: 'mahant@hanumanmandir.org',
          openingTime: '05:00:00',
          closingTime: '22:00:00',
          trustRegNo: 'TR-12345',
          trustDocUrl: 'https://storage.poojawala.com/doc.pdf',
          deityPhotoUrl: 'https://storage.poojawala.com/deity.jpg',
        };
        mockTempleRepo.findTempleById.mockResolvedValue(templeWithAllFields);

        const result = await service.getTempleById(1, false);

        expect(result.success).toBe(true);
        expect(result.data.primaryDeity).toBe('Lord Hanuman');
        expect(result.data.trustName).toBe('Hanuman Seva Trust');
        expect(result.data.contactName).toBe('Mahant Ji');
        expect(result.data.phone).toBe('+91 9999999999');
        expect(result.data.email).toBe('mahant@hanumanmandir.org');
        expect(result.data.openingTime).toBe('05:00:00');
        expect(result.data.closingTime).toBe('22:00:00');
        expect(result.data.trustRegNo).toBe('TR-12345');
        expect(result.data.trustDocUrl).toBe('https://storage.poojawala.com/doc.pdf');
        expect(result.data.deityPhotoUrl).toBe('https://storage.poojawala.com/deity.jpg');
      });
    });
  });
});

