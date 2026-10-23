import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TempleService } from './temple.service';
import { TempleRepository } from '@poojawala/repositories';
import { Temple, ACTOR_TYPE, USER_ROLE, AUDIT_MODULE } from '@poojawala/entities';
import { AuditLogService } from '@poojawala/common';
import { S3Service } from '@poojawala/s3';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTempleDto, UpdateTempleDto, GetTemplesQueryDto } from '@poojawala/dtos';

describe('TempleService', () => {
  let service: TempleService;
  let mockTempleRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAllTemples: jest.Mock;
    findTempleById: jest.Mock;
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
    };

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
        imageUrl: 'https://images.poojawala.com/ram.jpg',
        address: 'Ayodhya Dham',
        city: 'Ayodhya',
        state: 'Uttar Pradesh',
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
        imageUrl: null,
        address: null,
        city: null,
        state: null,
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
});

