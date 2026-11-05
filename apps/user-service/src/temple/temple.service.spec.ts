import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TempleService } from './temple.service';
import { TempleRepository } from '@poojawala/repositories';
import {
  Temple,
  TempleAarti,
  Service,
  ACTOR_TYPE,
  USER_ROLE,
  AUDIT_MODULE,
  TEMPLE_VERIFICATION_STATUS,
  NOTIFICATION_TYPE,
  User,
} from '@poojawala/entities';
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
  CreateServiceDto,
  UpdateTempleServiceDto,
} from '@poojawala/dtos';
import { DataSource } from 'typeorm';
import { EmailService } from '@poojawala/email-services';
import { NotificationService } from '@poojawala/notification';
import { ServiceService } from '../service/service.service';

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
    findDuplicateTemple?: jest.Mock;
    manager?: any;
  };
  let mockAartiRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };
  let mockUserRepo: {
    findOne: jest.Mock;
  };
  let mockServiceRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let mockEmailService: {
    sendTempleSubmittedEmail: jest.Mock;
    sendTempleApprovalEmail: jest.Mock;
    sendTempleRejectionEmail: jest.Mock;
  };
  let mockNotificationService: {
    notifyAdmins: jest.Mock;
    createNotification: jest.Mock;
    getGateway: jest.Mock;
  };
  let mockGateway: {
    notifyUser: jest.Mock;
    emitNotification: jest.Mock;
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
  let mockServiceService: {
    createService: jest.Mock;
    updateService: jest.Mock;
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
      findActiveServicesByTempleIds: jest.fn().mockResolvedValue([]),
      findAartisByTempleId: jest.fn().mockResolvedValue([]),
      findAartisByTempleIds: jest.fn().mockResolvedValue([]),
      findDuplicateTemple: jest.fn().mockResolvedValue(null),
    };

    mockAartiRepo = {
      create: jest.fn((data) => ({ ...data, id: 10 })),
      save: jest.fn(async (entity) => ({ ...entity, id: entity.id || 10 })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 50,
        email: 'purohit@example.com',
        firstName: 'Acharya',
        lastName: 'Sharma',
        role: USER_ROLE.PUROHIT,
      }),
    };

    mockGateway = {
      notifyUser: jest.fn(),
      emitNotification: jest.fn(),
    };

    mockEmailService = {
      sendTempleSubmittedEmail: jest.fn().mockResolvedValue(undefined),
      sendTempleApprovalEmail: jest.fn().mockResolvedValue(undefined),
      sendTempleRejectionEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      notifyAdmins: jest.fn().mockResolvedValue([]),
      createNotification: jest.fn().mockResolvedValue({ id: 1 }),
      getGateway: jest.fn().mockReturnValue(mockGateway),
    };

    mockServiceRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (s) => s),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockManager = {
      getRepository: jest.fn((entity) => {
        if (entity === TempleAarti) {
          return mockAartiRepo;
        }
        if (entity === Service) {
          return mockServiceRepo;
        }
        if (entity === User) {
          return mockUserRepo;
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

    mockServiceService = {
      createService: jest.fn().mockImplementation(async (dto, files, adminId, manager, options) => {
        return {
          success: true,
          message: `Service '${dto.name}' was created successfully.`,
          data: {
            id: 101,
            name: dto.name,
            slug: 'mock-service-slug',
            description: dto.description || null,
            templeId: dto.templeId,
            plans: dto.plans,
            isActive: true,
            iconUrl: dto.iconUrl || null,
          },
        };
      }),
      updateService: jest.fn().mockImplementation(async (id, dto, files, adminId, manager, options) => {
        return {
          success: true,
          message: `Service was updated successfully.`,
          data: {
            id,
            ...dto,
          },
        };
      }),
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
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: ServiceService,
          useValue: mockServiceService,
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

      expect(mockTempleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Shri Ram Mandir',
          slug: 'shri-ram-mandir',
          description: 'Magnificent temple',
          imageUrl: 'https://images.poojawala.com/ram.jpg',
          address: 'Ayodhya Dham',
          city: 'Ayodhya',
          state: 'Uttar Pradesh',
          isActive: true,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
          submittedByUserId: null,
          verificationRemarks: null,
        }),
      );
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

      expect(mockTempleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Simple Mandir',
          slug: 'simple-mandir',
          description: null,
          imageUrl: null,
          isActive: true,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
          submittedByUserId: null,
          verificationRemarks: null,
        }),
      );
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

    it('17. should return complete service details on getTempleById when temple has associated services', async () => {
      const fullServiceRecord = {
        id: 101,
        name: 'Grand Hanuman Chalisa Path',
        slug: 'grand-hanuman-chalisa-path',
        description: 'Detailed Vedic chanting and path',
        metaTitle: 'Hanuman Path Online',
        metaDescription: 'Book official path at temple',
        cities: [{ name: 'Haridwar', state: 'Uttarakhand' }],
        languages: [{ name: 'Hindi', code: 'hi' }],
        benefits: [{ title: 'Removes Obstacles', description: 'Overcomes difficulties' }],
        purohitCarryItems: ['Ganga Jal', 'Dhoop'],
        iconUrl: 'https://images.poojawala.com/services/hanuman.png',
        minPrice: 501,
        maxPrice: 1001,
        plans: {
          basic: { price: 501 },
          standard: { price: 1001 },
        },
        tokenPercentage: 20,
        commissionPercentage: 15,
        durationMinutes: 75,
        requiresVenue: false,
        isActive: true,
        isGlobal: false,
        isOnline: true,
        isOffline: true,
        isUpcomingFestival: false,
        festivalStartDate: null,
        festivalEndDate: null,
        sortOrder: 2,
        categoryId: 3,
        category: {
          id: 3,
          name: 'Pooja',
          slug: 'pooja',
        },
        templeId: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      };

      mockTempleRepo.findTempleById.mockResolvedValue(sampleActiveTemple);
      mockTempleRepo.findActiveServicesByTempleId.mockResolvedValue([fullServiceRecord]);

      const result = await service.getTempleById(1, false);

      expect(result.success).toBe(true);
      expect(result.data.services).toHaveLength(1);
      const svc = result.data.services![0];
      expect(svc.id).toBe(101);
      expect(svc.name).toBe('Grand Hanuman Chalisa Path');
      expect(svc.slug).toBe('grand-hanuman-chalisa-path');
      expect(svc.description).toBe('Detailed Vedic chanting and path');
      expect(svc.metaTitle).toBe('Hanuman Path Online');
      expect(svc.metaDescription).toBe('Book official path at temple');
      expect(svc.cities).toEqual([{ name: 'Haridwar', state: 'Uttarakhand' }]);
      expect(svc.languages).toEqual([{ name: 'Hindi', code: 'hi' }]);
      expect(svc.benefits).toEqual([{ title: 'Removes Obstacles', description: 'Overcomes difficulties' }]);
      expect(svc.purohitCarryItems).toEqual(['Ganga Jal', 'Dhoop']);
      expect(svc.iconUrl).toBe('https://images.poojawala.com/services/hanuman.png');
      expect(svc.durationMinutes).toBe(75);
      expect(svc.requiresVenue).toBe(false);
      expect(svc.isActive).toBe(true);
      expect(svc.isGlobal).toBe(false);
      expect(svc.isOnline).toBe(true);
      expect(svc.isOffline).toBe(true);
      expect(svc.sortOrder).toBe(2);
      expect(svc.categoryId).toBe(3);
      expect(svc.tokenPercentage).toBe(20);
      expect(svc.commissionPercentage).toBe(15);
      expect(svc.plans).toBeDefined();
      expect(svc.templeId).toBe(1);
      expect(svc.temple).toBeUndefined(); // no circular reference
    });

    it('18. should return complete service details on getTemples when temples have associated services', async () => {
      const templeOne: Temple = { ...sampleActiveTemple, id: 1, name: 'Temple 1' };
      const templeTwo: Temple = { ...sampleActiveTemple, id: 2, name: 'Temple 2' };

      mockTempleRepo.findAllTemples.mockResolvedValue({
        data: [templeOne, templeTwo],
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });

      const serviceOne = {
        id: 201,
        name: 'Temple 1 Special Aarti Service',
        templeId: 1,
        durationMinutes: 45,
        isOnline: true,
        isOffline: false,
        isActive: true,
        cities: [{ name: 'Varanasi', state: 'UP' }],
        plans: { basic: { price: 251 } },
      };

      const serviceTwo = {
        id: 202,
        name: 'Temple 2 Abhishekam Service',
        templeId: 2,
        durationMinutes: 60,
        isOnline: false,
        isOffline: true,
        isActive: true,
        cities: [{ name: 'Ujjain', state: 'MP' }],
        plans: { basic: { price: 501 } },
      };

      mockTempleRepo.findActiveServicesByTempleIds.mockResolvedValue([serviceOne, serviceTwo]);

      const result = await service.getTemples({ page: 1, limit: 10 }, false);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);

      // Temple 1 has service 201 with full details
      expect(result.data[0].services).toHaveLength(1);
      expect(result.data[0].services![0].id).toBe(201);
      expect(result.data[0].services![0].name).toBe('Temple 1 Special Aarti Service');
      expect(result.data[0].services![0].durationMinutes).toBe(45);
      expect(result.data[0].services![0].cities).toEqual([{ name: 'Varanasi', state: 'UP' }]);
      expect(result.data[0].services![0].temple).toBeUndefined();

      // Temple 2 has service 202 with full details
      expect(result.data[1].services).toHaveLength(1);
      expect(result.data[1].services![0].id).toBe(202);
      expect(result.data[1].services![0].name).toBe('Temple 2 Abhishekam Service');
      expect(result.data[1].services![0].durationMinutes).toBe(60);
      expect(result.data[1].services![0].cities).toEqual([{ name: 'Ujjain', state: 'MP' }]);
      expect(result.data[1].services![0].temple).toBeUndefined();
    });

    it('19. should return empty services array on getTemples when temple has no associated services', async () => {
      mockTempleRepo.findAllTemples.mockResolvedValue({
        data: [{ ...sampleActiveTemple, id: 3, name: 'Temple Without Services' }],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      mockTempleRepo.findActiveServicesByTempleIds.mockResolvedValue([]);

      const result = await service.getTemples({ page: 1, limit: 10 }, false);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].services).toEqual([]);
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

    describe('Purohit Temple Registration & Verification', () => {
      const mockPurohitUser = {
        id: 50,
        role: USER_ROLE.PUROHIT,
      } as User;

      const mockAdminUser = {
        id: 99,
        role: USER_ROLE.ADMIN,
      } as User;

      const mockOtherPurohitUser = {
        id: 77,
        role: USER_ROLE.PUROHIT,
      } as User;

      it('should default Purohit-created submissions to PENDING and assign submittedByUserId from auth user', async () => {
        const dto: CreateTempleDto = {
          name: 'Purohit Registered Temple',
          city: 'Varanasi',
        };

        const result = await service.createTempleWithUser(dto, undefined, mockPurohitUser);

        expect(mockTempleRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Purohit Registered Temple',
            submittedByUserId: 50,
            verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
            verificationRemarks: null,
          }),
        );
        expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: 50,
            actorRole: USER_ROLE.PUROHIT,
            action: 'TEMPLE_CREATED',
          }),
        );
        expect(result.success).toBe(true);
        expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
          'New Temple Submitted for Verification',
          'A Purohit has submitted "Purohit Registered Temple" for Admin review.',
          NOTIFICATION_TYPE.SYSTEM,
          1,
          'TEMPLE',
          expect.objectContaining({
            templeId: 1,
            templeName: 'Purohit Registered Temple',
            submittedByUserId: 50,
            action: 'TEMPLE_SUBMISSION_CREATED',
          }),
        );
      });

      it('1 & 2. Purohit creates a Temple: notification references the correct Temple ID, name, and is persisted', async () => {
        mockTempleRepo.save.mockImplementationOnce(async (entity) => ({
          ...entity,
          id: 42,
          name: 'Shree Krishna Temple',
          submittedByUserId: 50,
        }));

        const dto: CreateTempleDto = {
          name: 'Shree Krishna Temple',
          city: 'Mathura',
        };

        const result = await service.createTempleWithUser(dto, undefined, mockPurohitUser);

        expect(result.success).toBe(true);
        expect(mockNotificationService.notifyAdmins).toHaveBeenCalledTimes(1);
        expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
          'New Temple Submitted for Verification',
          'A Purohit has submitted "Shree Krishna Temple" for Admin review.',
          NOTIFICATION_TYPE.SYSTEM,
          42,
          'TEMPLE',
          expect.objectContaining({
            templeId: 42,
            templeName: 'Shree Krishna Temple',
            submittedByUserId: 50,
          }),
        );
        expect(mockEmailService.sendTempleSubmittedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendTempleSubmittedEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'purohit@example.com',
            templeName: 'Shree Krishna Temple',
            purohitName: 'Acharya Sharma',
          }),
        );
      });

      it('4 & 5. Failed Temple creation (transaction error/rollback) does not generate a notification', async () => {
        mockTempleRepo.save.mockRejectedValueOnce(new Error('Unique slug collision or database timeout'));

        const dto: CreateTempleDto = {
          name: 'Failed Temple',
        };

        await expect(
          service.createTempleWithUser(dto, undefined, mockPurohitUser),
        ).rejects.toThrow('Unique slug collision or database timeout');

        expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
      });

      it('6. Failed notification persistence is handled gracefully according to existing error conventions without failing temple creation', async () => {
        mockNotificationService.notifyAdmins.mockRejectedValueOnce(
          new Error('Notification service unreachable'),
        );

        const dto: CreateTempleDto = {
          name: 'Resilient Temple',
        };

        const result = await service.createTempleWithUser(dto, undefined, mockPurohitUser);

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(201);
      });

      it('does not send submission notification when Admin creates a temple', async () => {
        const dto: CreateTempleDto = {
          name: 'Admin Created Temple',
        };

        const result = await service.createTempleWithUser(dto, undefined, mockAdminUser);

        expect(result.success).toBe(true);
        expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
      });

      it('should prevent Purohit from spoofing submitter ID or setting APPROVED status on creation', async () => {
        const dto: Partial<CreateTempleDto> & { submittedByUserId?: number } = {
          name: 'Spoofed Temple',
          submittedByUserId: 12345, // Client attempts to spoof
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED, // Client attempts to self-approve
        };

        const result = await service.createTempleWithUser(dto as CreateTempleDto, undefined, mockPurohitUser);

        expect(mockTempleRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Spoofed Temple',
            submittedByUserId: 50, // Derived from auth user!
            verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING, // Enforced PENDING!
          }),
        );
        expect(result.success).toBe(true);
      });

      it('should allow Admin to create temple with APPROVED status by default', async () => {
        const dto: CreateTempleDto = {
          name: 'Admin Mandir',
        };

        const result = await service.createTempleWithUser(dto, undefined, mockAdminUser);

        expect(mockTempleRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Admin Mandir',
            submittedByUserId: null,
            verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
          }),
        );
        expect(result.success).toBe(true);
      });

      it('should allow Purohit to update their own submitted temple', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Original Name',
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const dto: UpdateTempleDto = {
          name: 'Updated By Submitting Purohit',
        };

        const result = await service.updateTempleWithUser(10, dto, undefined, mockPurohitUser);

        expect(result.success).toBe(true);
        expect(existingTemple.name).toBe('Updated By Submitting Purohit');
      });

      it('should throw ForbiddenException if Purohit attempts to update a temple submitted by another user', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50, // Owned by user 50
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const dto: UpdateTempleDto = {
          name: 'Hacked Name',
        };

        await expect(
          service.updateTempleWithUser(10, dto, undefined, mockOtherPurohitUser), // user 77
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException if Purohit attempts to change verificationStatus or verificationRemarks', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const dto: UpdateTempleDto = {
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
        };

        await expect(
          service.updateTempleWithUser(10, dto, undefined, mockPurohitUser),
        ).rejects.toThrow(ForbiddenException);

        const dtoWithRemarks: UpdateTempleDto = {
          verificationRemarks: 'Admin comment',
        };

        await expect(
          service.updateTempleWithUser(10, dtoWithRemarks, undefined, mockPurohitUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should allow Admin to approve a pending temple submission', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const dto: UpdateTempleDto = {
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
          verificationRemarks: 'Documents verified',
        };

        const result = await service.updateTempleWithUser(10, dto, undefined, mockAdminUser);

        expect(result.success).toBe(true);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.APPROVED);
        expect(existingTemple.verificationRemarks).toBe('Documents verified');
      });

      it('1. Admin rejection without remarks fails and does not update the status', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
          verificationRemarks: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        // Missing remarks
        await expect(
          service.updateTempleWithUser(
            10,
            { verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED },
            undefined,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendTempleRejectionEmail).not.toHaveBeenCalled();

        // Empty remarks
        await expect(
          service.updateTempleWithUser(
            10,
            { verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED, verificationRemarks: '' },
            undefined,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.PENDING);

        // Whitespace-only remarks
        await expect(
          service.updateTempleWithUser(
            10,
            { verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED, verificationRemarks: '   ' },
            undefined,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.PENDING);
      });

      it('2. Admin rejection with valid remarks succeeds', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Somnath Temple',
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const dto: UpdateTempleDto = {
          verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
          verificationRemarks: 'Trust certificate could not be verified with authorities',
        };

        const result = await service.updateTempleWithUser(10, dto, undefined, mockAdminUser);

        expect(result.success).toBe(true);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.REJECTED);
        expect(existingTemple.verificationRemarks).toBe(
          'Trust certificate could not be verified with authorities',
        );
        expect(mockEmailService.sendTempleRejectionEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'purohit@example.com',
            templeName: 'Somnath Temple',
            rejectionReason: 'Trust certificate could not be verified with authorities',
          }),
        );
      });

      it('3. Admin approval without remarks succeeds', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Somnath Temple',
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
          verificationRemarks: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const result = await service.updateTempleWithUser(
          10,
          { verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
          undefined,
          mockAdminUser,
        );

        expect(result.success).toBe(true);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.APPROVED);
        expect(existingTemple.verificationRemarks).toBeNull();
        expect(mockEmailService.sendTempleApprovalEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'purohit@example.com',
            templeName: 'Somnath Temple',
            remarks: null,
          }),
        );
      });

      it('4. Approval with remarks includes them in the email', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Somnath Temple',
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
          verificationRemarks: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const result = await service.updateTempleWithUser(
          10,
          {
            verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
            verificationRemarks: 'All physical trust documents successfully verified on-site.',
          },
          undefined,
          mockAdminUser,
        );

        expect(result.success).toBe(true);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.APPROVED);
        expect(existingTemple.verificationRemarks).toBe(
          'All physical trust documents successfully verified on-site.',
        );
        expect(mockEmailService.sendTempleApprovalEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'purohit@example.com',
            templeName: 'Somnath Temple',
            remarks: 'All physical trust documents successfully verified on-site.',
          }),
        );
        expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
          50,
          'Temple Submission Approved',
          expect.stringContaining('All physical trust documents successfully verified on-site.'),
          NOTIFICATION_TYPE.SYSTEM,
          10,
          'TEMPLE',
          true,
          expect.objectContaining({
            templeId: 10,
            templeName: 'Somnath Temple',
            verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
            verificationRemarks: 'All physical trust documents successfully verified on-site.',
          }),
        );
        expect(mockGateway.notifyUser).toHaveBeenCalledWith(
          50,
          'temple:verification_status',
          expect.objectContaining({
            templeId: 10,
            templeName: 'Somnath Temple',
            verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
            verificationRemarks: 'All physical trust documents successfully verified on-site.',
          }),
        );
      });

      it('5. Rejection email contains the required remarks', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Old Mandir',
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
          verificationRemarks: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        await service.updateTempleWithUser(
          10,
          {
            verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
            verificationRemarks: 'Deity photo does not meet Vedic authenticity guidelines',
          },
          undefined,
          mockAdminUser,
        );

        expect(mockEmailService.sendTempleRejectionEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendTempleRejectionEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'purohit@example.com',
            templeName: 'Old Mandir',
            rejectionReason: 'Deity photo does not meet Vedic authenticity guidelines',
          }),
        );
        expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
          50,
          'Temple Submission Rejected',
          expect.stringContaining('Deity photo does not meet Vedic authenticity guidelines'),
          NOTIFICATION_TYPE.SYSTEM,
          10,
          'TEMPLE',
          true,
          expect.objectContaining({
            templeId: 10,
            templeName: 'Old Mandir',
            verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
            verificationRemarks: 'Deity photo does not meet Vedic authenticity guidelines',
          }),
        );
        expect(mockGateway.notifyUser).toHaveBeenCalledWith(
          50,
          'temple:verification_status',
          expect.objectContaining({
            templeId: 10,
            templeName: 'Old Mandir',
            verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
            verificationRemarks: 'Deity photo does not meet Vedic authenticity guidelines',
          }),
        );
      });

      it('6. Emails are sent only on actual verification status transitions', async () => {
        // PENDING -> APPROVED sends email
        const templePending: Temple = {
          ...sampleActiveTemple,
          id: 11,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(templePending);
        await service.updateTempleWithUser(
          11,
          { verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
          undefined,
          mockAdminUser,
        );
        expect(mockEmailService.sendTempleApprovalEmail).toHaveBeenCalledTimes(1);
        mockEmailService.sendTempleApprovalEmail.mockClear();

        // REJECTED -> APPROVED sends email
        const templeRejected: Temple = {
          ...sampleActiveTemple,
          id: 12,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
          verificationRemarks: 'Old reason',
        };
        mockTempleRepo.findOne.mockResolvedValue(templeRejected);
        await service.updateTempleWithUser(
          12,
          { verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
          undefined,
          mockAdminUser,
        );
        expect(mockEmailService.sendTempleApprovalEmail).toHaveBeenCalledTimes(1);
        mockEmailService.sendTempleApprovalEmail.mockClear();

        // APPROVED -> REJECTED sends email
        const templeApproved: Temple = {
          ...sampleActiveTemple,
          id: 13,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
        };
        mockTempleRepo.findOne.mockResolvedValue(templeApproved);
        await service.updateTempleWithUser(
          13,
          {
            verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
            verificationRemarks: 'Revoked due to trust ownership dispute',
          },
          undefined,
          mockAdminUser,
        );
        expect(mockEmailService.sendTempleRejectionEmail).toHaveBeenCalledTimes(1);
        mockEmailService.sendTempleRejectionEmail.mockClear();

        // APPROVED -> APPROVED does not send email
        const templeAlreadyApproved: Temple = {
          ...sampleActiveTemple,
          id: 14,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
        };
        mockTempleRepo.findOne.mockResolvedValue(templeAlreadyApproved);
        await service.updateTempleWithUser(
          14,
          { verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
          undefined,
          mockAdminUser,
        );
        expect(mockEmailService.sendTempleApprovalEmail).not.toHaveBeenCalled();

        // REJECTED -> REJECTED with updated remarks does not send email
        const templeAlreadyRejected: Temple = {
          ...sampleActiveTemple,
          id: 15,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
          verificationRemarks: 'Old reason',
        };
        mockTempleRepo.findOne.mockResolvedValue(templeAlreadyRejected);
        await service.updateTempleWithUser(
          15,
          {
            verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
            verificationRemarks: 'Updated reason for rejection',
          },
          undefined,
          mockAdminUser,
        );
        expect(mockEmailService.sendTempleRejectionEmail).not.toHaveBeenCalled();
      });

      it('7. Unrelated Temple updates do not trigger verification emails', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        await service.updateTempleWithUser(
          10,
          {
            name: 'Updated Temple Name',
            description: 'Updated Description',
            city: 'New City',
          },
          undefined,
          mockAdminUser,
        );

        expect(mockEmailService.sendTempleApprovalEmail).not.toHaveBeenCalled();
        expect(mockEmailService.sendTempleRejectionEmail).not.toHaveBeenCalled();
      });

      it('8. Email failure does not incorrectly roll back an already committed verification update', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);
        mockEmailService.sendTempleApprovalEmail.mockRejectedValueOnce(
          new Error('SES Connection timeout'),
        );

        const result = await service.updateTempleWithUser(
          10,
          { verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
          undefined,
          mockAdminUser,
        );

        expect(result.success).toBe(true);
        expect(existingTemple.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.APPROVED);
        expect(mockTempleRepo.save).toHaveBeenCalled();
      });

      it('should safely log warning and not crash when submitter has no valid email', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);
        mockUserRepo.findOne.mockResolvedValueOnce({
          id: 50,
          email: null,
        });

        const result = await service.updateTempleWithUser(
          10,
          { verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED },
          undefined,
          mockAdminUser,
        );

        expect(result.success).toBe(true);
        expect(mockEmailService.sendTempleApprovalEmail).not.toHaveBeenCalled();
      });

      it('9. A Purohit can delete their own Temple', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Purohit Temple',
          submittedByUserId: 50,
          deletedAt: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const result = await service.deleteTemple(10, mockPurohitUser);

        expect(result.success).toBe(true);
        expect(existingTemple.deletedAt).toBeInstanceOf(Date);
        expect(mockAartiRepo.update).toHaveBeenCalledWith(
          expect.objectContaining({ templeId: 10 }),
          expect.objectContaining({ deletedAt: expect.any(Date) }),
        );
        expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: 50,
            actorRole: USER_ROLE.PUROHIT,
            action: 'TEMPLE_DELETED',
          }),
        );
      });

      it("10. A Purohit cannot delete another Purohit's Temple", async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          name: 'Other Purohit Temple',
          submittedByUserId: 77,
          deletedAt: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        await expect(
          service.deleteTemple(10, mockPurohitUser),
        ).rejects.toThrow(ForbiddenException);

        expect(existingTemple.deletedAt).toBeNull();
      });

      it('11. Unauthorized roles cannot delete Temples', async () => {
        const mockCustomerUser = {
          id: 88,
          role: USER_ROLE.CUSTOMER,
        } as User;

        await expect(
          service.deleteTemple(10, mockCustomerUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('12. Soft-deleted Temples and aartis are no longer publicly visible', async () => {
        mockTempleRepo.findTempleById.mockResolvedValue(null);

        await expect(
          service.getTempleById(10, false),
        ).rejects.toThrow(NotFoundException);

        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(10, false);
      });

      it('13. Related booking and financial records remain intact on temple soft deletion', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 50,
          deletedAt: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        await service.deleteTemple(10, mockPurohitUser);

        expect(existingTemple.deletedAt).toBeDefined();
        expect(mockTempleRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: 10, deletedAt: expect.any(Date) }),
        );
      });

      it('14. Existing Admin CRUD and Temple verification behavior continues working', async () => {
        const existingTemple: Temple = {
          ...sampleActiveTemple,
          id: 10,
          submittedByUserId: 77,
          deletedAt: null,
        };
        mockTempleRepo.findOne.mockResolvedValue(existingTemple);

        const deleteResult = await service.deleteTemple(10, mockAdminUser);
        expect(deleteResult.success).toBe(true);
        expect(existingTemple.deletedAt).toBeInstanceOf(Date);
        expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: 99,
            actorRole: USER_ROLE.ADMIN,
            action: 'TEMPLE_DELETED',
          }),
        );

        // Backward compatibility: passing number adminId directly
        existingTemple.deletedAt = null;
        const legacyDeleteResult = await service.deleteTemple(10, 99);
        expect(legacyDeleteResult.success).toBe(true);
        expect(existingTemple.deletedAt).toBeInstanceOf(Date);
      });

      it('should validate invalid status values in UpdateTempleDto validation pipe', async () => {
        const invalidDto = plainToInstance(UpdateTempleDto, {
          verificationStatus: 'INVALID_STATUS',
        });
        const errors = await validate(invalidDto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('verificationStatus');
      });

      it('should reject rejection in UpdateTempleDto when verificationRemarks is empty or missing', async () => {
        const missingRemarksDto = plainToInstance(UpdateTempleDto, {
          verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
        });
        const errors1 = await validate(missingRemarksDto);
        expect(errors1.some((e) => e.property === 'verificationRemarks')).toBe(true);

        const emptyRemarksDto = plainToInstance(UpdateTempleDto, {
          verificationStatus: TEMPLE_VERIFICATION_STATUS.REJECTED,
          verificationRemarks: '   ',
        });
        const errors2 = await validate(emptyRemarksDto);
        expect(errors2.some((e) => e.property === 'verificationRemarks')).toBe(true);
      });
    });

    describe('Role-Based Temple Visibility for GET APIs', () => {
      const mockAdminUser = { id: 1, role: USER_ROLE.ADMIN } as User;
      const mockPurohitUser = { id: 50, role: USER_ROLE.PUROHIT } as User;
      const mockCustomerUser = { id: 200, role: USER_ROLE.CUSTOMER } as User;

      it('1. Anonymous user sees only active, approved, non-deleted temples', async () => {
        const query: GetTemplesQueryDto = { page: 1, limit: 10 };
        mockTempleRepo.findAllTemples.mockResolvedValueOnce({
          data: [sampleActiveTemple],
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        });

        const res = await service.getTemples(query, false);
        expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(query, false);
        expect(res.success).toBe(true);
        expect(res.data).toHaveLength(1);
      });

      it('2. Anonymous user cannot retrieve a pending, rejected, inactive, or deleted temple by ID', async () => {
        // When repo filters out pending/rejected/inactive/deleted, findTempleById returns null
        mockTempleRepo.findTempleById.mockResolvedValueOnce(null);
        await expect(service.getTempleById(99, false)).rejects.toThrow(NotFoundException);
        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(99, false);
      });

      it('3. Admin sees all non-deleted temples, including pending, rejected, and inactive temples', async () => {
        const pendingTemple: Temple = {
          ...sampleActiveTemple,
          id: 20,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
          isActive: false,
        };
        mockTempleRepo.findTempleById.mockResolvedValueOnce(pendingTemple);

        const res = await service.getTempleById(20, mockAdminUser);
        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(20, mockAdminUser);
        expect(res.success).toBe(true);
        expect(res.data.id).toBe(20);
        expect(res.data.verificationStatus).toBe(TEMPLE_VERIFICATION_STATUS.PENDING);
        expect(res.data.isActive).toBe(false);
      });

      it('4. Admin cannot retrieve a soft-deleted temple', async () => {
        mockTempleRepo.findTempleById.mockResolvedValueOnce(null);

        await expect(service.getTempleById(3, mockAdminUser)).rejects.toThrow(NotFoundException);
        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(3, mockAdminUser);
      });

      it('5. Purohit sees only their own non-deleted temples', async () => {
        const query: GetTemplesQueryDto = { page: 1, limit: 10 };
        mockTempleRepo.findAllTemples.mockResolvedValueOnce({
          data: [{ ...sampleActiveTemple, submittedByUserId: 50 }],
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        });

        const res = await service.getTemples(query, mockPurohitUser);
        expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(query, mockPurohitUser);
        expect(res.success).toBe(true);
        expect(res.data[0].submittedByUserId).toBe(50);
      });

      it('6. Purohit can retrieve their own pending/rejected/inactive temple by ID', async () => {
        const ownPendingTemple: Temple = {
          ...sampleActiveTemple,
          id: 55,
          submittedByUserId: 50,
          verificationStatus: TEMPLE_VERIFICATION_STATUS.PENDING,
          isActive: false,
        };
        mockTempleRepo.findTempleById.mockResolvedValueOnce(ownPendingTemple);

        const res = await service.getTempleById(55, mockPurohitUser);
        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(55, mockPurohitUser);
        expect(res.success).toBe(true);
        expect(res.data.id).toBe(55);
        expect(res.data.submittedByUserId).toBe(50);
      });

      it('7. Purohit cannot retrieve another Purohit temple by ID (returns 404)', async () => {
        // Repository filters out temples not owned by this Purohit and returns null
        mockTempleRepo.findTempleById.mockResolvedValueOnce(null);

        await expect(service.getTempleById(77, mockPurohitUser)).rejects.toThrow(NotFoundException);
        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(77, mockPurohitUser);
      });

      it('8. Customer receives only public-approved temple data', async () => {
        const query: GetTemplesQueryDto = { page: 1, limit: 10 };
        mockTempleRepo.findAllTemples.mockResolvedValueOnce({
          data: [sampleActiveTemple],
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        });

        const res = await service.getTemples(query, mockCustomerUser);
        expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(query, mockCustomerUser);
        expect(res.success).toBe(true);

        mockTempleRepo.findTempleById.mockResolvedValueOnce(sampleActiveTemple);
        const detailRes = await service.getTempleById(1, mockCustomerUser);
        expect(mockTempleRepo.findTempleById).toHaveBeenCalledWith(1, mockCustomerUser);
        expect(detailRes.success).toBe(true);
      });

      it('9. Invalid/expired authentication defaults to public visibility', async () => {
        const query: GetTemplesQueryDto = { page: 1, limit: 10 };
        mockTempleRepo.findAllTemples.mockResolvedValueOnce({
          data: [sampleActiveTemple],
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        });

        const res = await service.getTemples(query, undefined);
        expect(mockTempleRepo.findAllTemples).toHaveBeenCalledWith(query, false);
        expect(res.success).toBe(true);

        mockTempleRepo.findTempleById.mockResolvedValueOnce(null);
        await expect(service.getTempleById(99, undefined)).rejects.toThrow(NotFoundException);
      });

      it('10. Existing filters, pagination, response shape, and Aarti behavior remain intact', async () => {
        const query: GetTemplesQueryDto = {
          page: 2,
          limit: 5,
          search: 'Hanuman',
          city: 'Ghaziabad',
          includeAartis: true,
        };
        mockTempleRepo.findAllTemples.mockResolvedValueOnce({
          data: [sampleActiveTemple],
          page: 2,
          limit: 5,
          total: 15,
          totalPages: 3,
        });
        mockTempleRepo.findAartisByTempleIds.mockResolvedValueOnce([
          {
            id: 1,
            templeId: sampleActiveTemple.id,
            name: 'Morning Aarti',
            slug: 'morning-aarti',
            time: '06:00:00',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          } as TempleAarti,
        ]);

        const res = await service.getTemples(query, false);
        expect(res.pagination.page).toBe(2);
        expect(res.pagination.limit).toBe(5);
        expect(res.pagination.total).toBe(15);
        expect(res.data[0].aartis).toHaveLength(1);
        expect(res.data[0].aartis?.[0].name).toBe('Morning Aarti');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MULTIPLE SERVICE CREATION DURING TEMPLE CREATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Multiple Service Creation During Temple Creation', () => {
    const mockAdmin = { id: 1, role: USER_ROLE.ADMIN } as User;
    const mockPurohit = { id: 50, role: USER_ROLE.PUROHIT, email: 'purohit@example.com' } as User;

    it('should create a temple without services (backward compatibility)', async () => {
      const dto: CreateTempleDto = {
        name: 'Shiv Mandir Without Services',
      };

      const result = await service.createTempleWithUser(dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(result.data.name).toBe('Shiv Mandir Without Services');
      expect(result.data.services).toBeUndefined();
      expect(mockServiceService.createService).not.toHaveBeenCalled();
    });

    it('should create a temple with services: [] without creating any services', async () => {
      const dto: CreateTempleDto = {
        name: 'Shiv Mandir Empty Services',
        services: [],
      };

      const result = await service.createTempleWithUser(dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(result.data.services).toEqual([]);
      expect(mockServiceService.createService).not.toHaveBeenCalled();
    });

    it('should successfully create multiple services and associate them with the new temple', async () => {
      const dto: CreateTempleDto = {
        name: 'Kashi Vishwanath Mandir',
        services: [
          {
            name: 'Rudrabhishek Pooja',
            plans: { basic: { price: 2100 } },
            commissionPercentage: 10,
            durationMinutes: 60,
            requiresVenue: false,
          } as CreateServiceDto,
          {
            name: 'Maha Mrityunjaya Jaap',
            plans: { basic: { price: 5100 } },
            commissionPercentage: 15,
            durationMinutes: 120,
            requiresVenue: true,
          } as CreateServiceDto,
        ],
      };

      mockServiceService.createService
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 101,
            name: 'Rudrabhishek Pooja',
            slug: 'rudrabhishek-pooja',
            templeId: 1,
            plans: { basic: { price: 2100 } },
            isActive: true,
            iconUrl: 'https://storage.poojawala.com/icon1.png',
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 102,
            name: 'Maha Mrityunjaya Jaap',
            slug: 'maha-mrityunjaya-jaap',
            templeId: 1,
            plans: { basic: { price: 5100 } },
            isActive: true,
            iconUrl: 'https://storage.poojawala.com/icon2.png',
          },
        });

      const result = await service.createTempleWithUser(dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(mockServiceService.createService).toHaveBeenCalledTimes(2);

      // Verify templeId is set to the newly created temple's id (1)
      expect(mockServiceService.createService).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          name: 'Rudrabhishek Pooja',
          templeId: 1,
        }),
        undefined,
        1,
        expect.anything(),
        { skipNotifications: true, skipTempleValidation: true },
      );

      expect(mockServiceService.createService).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          name: 'Maha Mrityunjaya Jaap',
          templeId: 1,
        }),
        undefined,
        1,
        expect.anything(),
        { skipNotifications: true, skipTempleValidation: true },
      );

      // Verify response includes both created services
      expect(result.data.services).toHaveLength(2);
      expect(result.data.services?.[0].name).toBe('Rudrabhishek Pooja');
      expect(result.data.services?.[1].name).toBe('Maha Mrityunjaya Jaap');

      // Verify admin notifications are dispatched for each service after commit
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'Service Created',
        `Service 'Rudrabhishek Pooja' was created successfully.`,
        NOTIFICATION_TYPE.SYSTEM,
        101,
        'SERVICE',
        expect.objectContaining({ serviceId: 101, templeId: 1 }),
      );
    });

    it('should override any client-provided templeId in nested service payloads', async () => {
      const dto: CreateTempleDto = {
        name: 'Mahakal Mandir',
        services: [
          {
            name: 'Bhasma Aarti Service',
            templeId: 99999, // Client attempts to link to a different temple
            plans: { basic: { price: 1500 } },
            commissionPercentage: 10,
            durationMinutes: 45,
            requiresVenue: true,
          } as CreateServiceDto,
        ],
      };

      await service.createTempleWithUser(dto, undefined, mockAdmin);

      expect(mockServiceService.createService).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bhasma Aarti Service',
          templeId: 1, // Overridden by newly created temple's id
        }),
        undefined,
        1,
        expect.anything(),
        expect.anything(),
      );
    });

    it('should roll back and NOT emit notifications if any service fails validation or persistence', async () => {
      const dto: CreateTempleDto = {
        name: 'Rollback Temple',
        services: [
          {
            name: 'Valid Service 1',
            plans: { basic: { price: 1000 } },
            commissionPercentage: 10,
            durationMinutes: 60,
            requiresVenue: false,
          } as CreateServiceDto,
          {
            name: 'Invalid Service 2',
            plans: { basic: { price: -50 } }, // Invalid price
            commissionPercentage: 10,
            durationMinutes: 60,
            requiresVenue: false,
          } as CreateServiceDto,
        ],
      };

      mockServiceService.createService
        .mockResolvedValueOnce({
          success: true,
          data: { id: 101, name: 'Valid Service 1', templeId: 1 },
        })
        .mockRejectedValueOnce(new BadRequestException('basic plan price must be a finite positive number greater than 0'));

      await expect(service.createTempleWithUser(dto, undefined, mockAdmin)).rejects.toThrow(
        BadRequestException,
      );

      // Verify no notifications were emitted for any service
      expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
    });

    it('should roll back if service duplicate name conflict occurs', async () => {
      const dto: CreateTempleDto = {
        name: 'Duplicate Check Temple',
        services: [
          {
            name: 'Existing Online Service',
            plans: { basic: { price: 1000 } },
            commissionPercentage: 10,
            durationMinutes: 60,
            requiresVenue: false,
          } as CreateServiceDto,
        ],
      };

      mockServiceService.createService.mockRejectedValueOnce(
        new BadRequestException('An offline service with name "Existing Online Service" already exists'),
      );

      await expect(service.createTempleWithUser(dto, undefined, mockAdmin)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
    });

    it('should reject Purohit submitting a temple with non-empty services with HTTP 403 ForbiddenException', async () => {
      const dto: CreateTempleDto = {
        name: 'Purohit Temple With Services',
        services: [
          {
            name: 'Unauthorized Service',
            plans: { basic: { price: 1000 } },
            commissionPercentage: 10,
            durationMinutes: 60,
            requiresVenue: false,
          } as CreateServiceDto,
        ],
      };

      await expect(
        service.createTempleWithUser(dto, undefined, mockPurohit),
      ).rejects.toThrow(ForbiddenException);

      // Neither temple nor service should be created
      expect(mockTempleRepo.save).not.toHaveBeenCalled();
      expect(mockServiceService.createService).not.toHaveBeenCalled();
    });

    it('should allow Purohit submitting a temple with empty or omitted services array', async () => {
      const dto: CreateTempleDto = {
        name: 'Purohit Temple With Empty Services',
        services: [],
      };

      const result = await service.createTempleWithUser(dto, undefined, mockPurohit);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(mockServiceService.createService).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEMPLE PATCH API: REMOVE AN ASSOCIATED SERVICE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Temple PATCH API: Remove an Associated Service', () => {
    const mockAdmin: User = {
      id: 99,
      email: 'admin@poojawala.com',
      role: USER_ROLE.ADMIN,
    } as User;

    const mockPurohit: User = {
      id: 42,
      email: 'purohit@poojawala.com',
      role: USER_ROLE.PUROHIT,
    } as User;

    const testTemple: Temple = {
      id: 1,
      name: 'Shri Hanuman Mandir',
      slug: 'shri-hanuman-mandir',
      description: 'Ancient temple',
      isActive: true,
      verificationStatus: TEMPLE_VERIFICATION_STATUS.APPROVED,
      submittedByUserId: 42,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      deletedAt: null,
    } as Temple;

    beforeEach(() => {
      mockTempleRepo.findOne.mockResolvedValue({ ...testTemple });
      mockTempleRepo.save.mockImplementation(async (t) => ({ ...t, updatedAt: new Date() }));
    });

    it('1. should remove a single associated service from a temple when remove is true (templeId becomes null)', async () => {
      const existingService: Service = {
        id: 10,
        name: 'Ganga Aarti Online',
        slug: 'ganga-aarti-online',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find
        .mockResolvedValueOnce([existingService])
        .mockResolvedValueOnce([]);

      const dto: UpdateTempleDto = {
        services: [{ id: 10, remove: true }],
      };

      const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          templeId: null,
        }),
      );
      // Service record is NOT deleted
      expect(existingService.deletedAt).toBeNull();
      // Returned services is empty (since service 10 was detached)
      expect(result.data.services).toEqual([]);
    });

    it('2. should soft-delete the service when delete is true', async () => {
      const existingService: Service = {
        id: 10,
        name: 'Ganga Aarti Online',
        slug: 'ganga-aarti-online',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find
        .mockResolvedValueOnce([existingService])
        .mockResolvedValueOnce([]);

      const dto: UpdateTempleDto = {
        services: [{ id: 10, delete: true }],
      };

      const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          deletedAt: expect.any(Date),
          isActive: false,
        }),
      );
      expect(existingService.deletedAt).toBeInstanceOf(Date);
      expect(existingService.isActive).toBe(false);
      // Returned services is empty (since service 10 was soft-deleted)
      expect(result.data.services).toEqual([]);
    });

    it('3. should handle multiple services simultaneously (one removed/detached and one soft-deleted)', async () => {
      const serviceA: Service = {
        id: 10,
        name: 'Service A',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;
      const serviceB: Service = {
        id: 11,
        name: 'Service B',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find
        .mockResolvedValueOnce([serviceA, serviceB])
        .mockResolvedValueOnce([]);

      const dto: UpdateTempleDto = {
        services: [
          { id: 10, remove: true },
          { id: 11, delete: true },
        ],
      };

      const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      // Service A is detached (templeId: null, deletedAt remains null)
      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, templeId: null }),
      );
      expect(serviceA.deletedAt).toBeNull();

      // Service B is soft-deleted (deletedAt: not null, isActive: false)
      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 11, deletedAt: expect.any(Date), isActive: false }),
      );
      expect(serviceB.deletedAt).toBeInstanceOf(Date);
      expect(serviceB.isActive).toBe(false);
    });

    it('4. should reject removing a service that belongs to another temple (HTTP 400 Bad Request)', async () => {
      const foreignService: Service = {
        id: 20,
        name: 'Foreign Temple Service',
        templeId: 2, // belongs to temple 2, but we are updating temple 1
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find.mockResolvedValue([foreignService]);

      const dto: UpdateTempleDto = {
        services: [{ id: 20, remove: true }],
      };

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow('Service with id 20 does not belong to temple 1');

      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('5. should reject a nonexistent service ID (HTTP 400 Bad Request)', async () => {
      mockServiceRepo.find.mockResolvedValue([]); // service 999 not found

      const dto: UpdateTempleDto = {
        services: [{ id: 999, remove: true }],
      };

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow('Service with id 999 not found');

      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('6. should reject modifying an already deleted service (HTTP 400 Bad Request)', async () => {
      const deletedService: Service = {
        id: 30,
        name: 'Soft Deleted Service',
        templeId: 1,
        deletedAt: new Date('2026-01-01'),
        isActive: false,
      } as Service;

      mockServiceRepo.find.mockResolvedValue([deletedService]);

      const dto: UpdateTempleDto = {
        services: [{ id: 30, remove: true }],
      };

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow('Service with id 30 has already been deleted and cannot be modified');

      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('7. should preserve unrelated services belonging to the temple', async () => {
      const serviceToRemove: Service = {
        id: 10,
        name: 'Service To Remove',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;
      const unrelatedService: Service = {
        id: 11,
        name: 'Unrelated Active Service',
        slug: 'unrelated-active-service',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find
        .mockResolvedValueOnce([serviceToRemove])
        .mockResolvedValueOnce([unrelatedService]);

      const dto: UpdateTempleDto = {
        services: [{ id: 10, remove: true }],
      };

      const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(mockServiceRepo.save).toHaveBeenCalledTimes(1);
      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, templeId: null }),
      );

      // Remaining services contains the untouched unrelatedService
      expect(result.data.services).toHaveLength(1);
      expect(result.data.services[0].id).toBe(11);
      expect(result.data.services[0].name).toBe('Unrelated Active Service');
    });

    it('8. should preserve service entity and historical data when remove is used (detachment only, no cascade delete)', async () => {
      const existingService: Service = {
        id: 10,
        name: 'Historical Service',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find
        .mockResolvedValueOnce([existingService])
        .mockResolvedValueOnce([]);

      const dto: UpdateTempleDto = {
        services: [{ id: 10, remove: true }],
      };

      await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          templeId: null,
          deletedAt: null,
          isActive: true,
        }),
      );
      expect(existingService.deletedAt).toBeNull();
    });

    it('9. should rollback transaction if one service in a batch fails validation', async () => {
      const validService: Service = {
        id: 10,
        name: 'Valid Service',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockServiceRepo.find.mockResolvedValueOnce([validService]);

      const dto: UpdateTempleDto = {
        services: [
          { id: 10, remove: true },
          { id: 999, remove: true },
        ],
      };

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockAdmin),
      ).rejects.toThrow('Service with id 999 not found');

      expect(mockServiceRepo.save).not.toHaveBeenCalled();
      expect(validService.templeId).toBe(1);
    });

    it('10. should reject Purohit attempting to remove or delete services from a temple (HTTP 403 Forbidden)', async () => {
      const dto: UpdateTempleDto = {
        services: [{ id: 10, remove: true }],
      };

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockPurohit),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateTempleWithUser(1, dto, undefined, mockPurohit),
      ).rejects.toThrow('Purohits cannot remove services from a temple');

      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('11. should keep existing Temple PATCH backward-compatible when services is omitted', async () => {
      const dto: UpdateTempleDto = {
        name: 'Updated Mandir Name Only',
      };

      const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(mockTempleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Mandir Name Only' }),
      );
      expect(result.data.services).toBeUndefined();
      expect(mockServiceRepo.find).not.toHaveBeenCalled();
      expect(mockServiceRepo.save).not.toHaveBeenCalled();
    });

    it('12. should keep existing Aarti add/update/remove behavior intact alongside service operations', async () => {
      const existingAarti: TempleAarti = {
        id: 101,
        templeId: 1,
        name: 'Sandhya Aarti',
        time: '19:00',
        isActive: true,
        deletedAt: null,
      } as TempleAarti;

      const existingService: Service = {
        id: 10,
        name: 'Special Pooja Service',
        templeId: 1,
        deletedAt: null,
        isActive: true,
      } as Service;

      mockAartiRepo.find
        .mockResolvedValueOnce([existingAarti])
        .mockResolvedValueOnce([]); // remaining aartis
      mockServiceRepo.find
        .mockResolvedValueOnce([existingService])
        .mockResolvedValueOnce([]); // remaining services

      const dto: UpdateTempleDto = {
        aartis: [{ id: 101, isDeleted: true }],
        services: [{ id: 10, remove: true }],
      };

      const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

      expect(result.success).toBe(true);
      expect(mockAartiRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 101,
          deletedAt: expect.any(Date),
        }),
      );
      expect(mockServiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          templeId: null,
        }),
      );
    });

    describe('UpdateTempleServiceDto & UpdateTempleDto validation', () => {
      it('should validate valid UpdateTempleServiceDto with remove', async () => {
        const dto = plainToInstance(UpdateTempleServiceDto, {
          id: 5,
          remove: true,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
        expect(dto.id).toBe(5);
        expect(dto.remove).toBe(true);
      });

      it('should validate valid UpdateTempleServiceDto with delete', async () => {
        const dto = plainToInstance(UpdateTempleServiceDto, {
          id: 5,
          delete: true,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
        expect(dto.id).toBe(5);
        expect(dto.delete).toBe(true);
      });

      it('should reject non-integer id in UpdateTempleServiceDto', async () => {
        const dto = plainToInstance(UpdateTempleServiceDto, {
          id: 'invalid-id',
          remove: true,
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'id')).toBe(true);
      });

      it('should reject id <= 0 in UpdateTempleServiceDto', async () => {
        const dto = plainToInstance(UpdateTempleServiceDto, {
          id: 0,
          remove: true,
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'id')).toBe(true);
      });

      it('should transform and validate JSON-stringified services in UpdateTempleDto', async () => {
        const payload = {
          name: 'Test Temple',
          services: JSON.stringify([{ id: 15, remove: 'true' }]),
        };
        const dto = plainToInstance(UpdateTempleDto, payload);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
        expect(Array.isArray(dto.services)).toBe(true);
        expect(dto.services![0].id).toBe(15);
        expect(dto.services![0].remove).toBe(true);
      });

      describe('Regression Suite: Service payload validation across CreateTempleDto, UpdateTempleDto, and CreateServiceDto', () => {
        const exactServicePayload = {
          name: 'Shri Hanuman Pooja',
          categoryId: 1,
          description: 'Complete Vedic Pooja and Aarti',
          plans: {
            basic: { price: 501, description: 'Basic path' },
            standard: { price: 1001, description: 'Standard path with havan' },
          },
          commissionPercentage: 10,
          tokenPercentage: 10,
          durationMinutes: 60,
          requiresVenue: false,
          isOnline: true,
          isOffline: false,
          languages: ['Hindi', 'Sanskrit'],
        };

        const extractErrorMessages = (errs: any[]): string[] => {
          const msgs: string[] = [];
          for (const e of errs) {
            if (e.constraints) msgs.push(...Object.values(e.constraints as Record<string, string>));
            if (e.children && e.children.length > 0) msgs.push(...extractErrorMessages(e.children));
          }
          return msgs;
        };

        it('1. should require id and reject non-whitelisted properties on UpdateTempleDto (PATCH /temples/:id)', async () => {
          const updateDtoWithoutId = plainToInstance(UpdateTempleDto, {
            services: [
              {
                ...exactServicePayload,
                unexpectedExtraField: 'invalid',
              },
            ],
          });

          const errors = await validate(updateDtoWithoutId, { whitelist: true, forbidNonWhitelisted: true });
          const errorMessages = extractErrorMessages(errors);

          expect(errorMessages).toContain('Service ID must be an integer');
          expect(errorMessages).toContain('property unexpectedExtraField should not exist');
        });

        it('1b. should accept full service editable payload when valid id is provided on UpdateTempleDto (PATCH /temples/:id)', async () => {
          const updateDtoWithId = plainToInstance(UpdateTempleDto, {
            services: [
              {
                id: 10,
                ...exactServicePayload,
              },
            ],
          });

          const errors = await validate(updateDtoWithId, { whitelist: true, forbidNonWhitelisted: true });
          const errorMessages = extractErrorMessages(errors);

          expect(errorMessages).toHaveLength(0);
          expect(updateDtoWithId.services).toHaveLength(1);
          expect(updateDtoWithId.services![0].id).toBe(10);
          expect(updateDtoWithId.services![0].name).toBe('Shri Hanuman Pooja');
        });

        it('2. should accept the exact service creation payload when sent to CreateTempleDto (POST /temples/add)', async () => {
          const createTemplePayload = {
            name: 'Shri Siddhivinayak Temple',
            address: 'Prabhadevi',
            city: 'Mumbai',
            state: 'Maharashtra',
            services: [exactServicePayload],
          };

          const createDto = plainToInstance(CreateTempleDto, createTemplePayload);
          const errors = await validate(createDto, { whitelist: true, forbidNonWhitelisted: true });
          const errorMessages = extractErrorMessages(errors);

          // Must produce zero validation errors
          expect(errorMessages).toHaveLength(0);
          expect(createDto.services).toBeDefined();
          expect(createDto.services!.length).toBe(1);
          expect(createDto.services![0]).toBeInstanceOf(CreateServiceDto);
          expect(createDto.services![0].name).toBe('Shri Hanuman Pooja');
          expect(createDto.services![0].categoryId).toBe(1);
        });

        it('3. should accept the exact service creation payload for standalone service creation (POST /services with CreateServiceDto)', async () => {
          const standaloneServiceDto = plainToInstance(CreateServiceDto, exactServicePayload);
          const errors = await validate(standaloneServiceDto, { whitelist: true, forbidNonWhitelisted: true });
          const errorMessages = extractErrorMessages(errors);

          expect(errorMessages).toHaveLength(0);
          expect(standaloneServiceDto.name).toBe('Shri Hanuman Pooja');
          expect(standaloneServiceDto.categoryId).toBe(1);
          expect(standaloneServiceDto.plans).toBeDefined();
        });

        it('4. should accept valid remove and delete operations on UpdateTempleDto (PATCH /temples/:id)', async () => {
          const validPatchPayload = {
            services: [
              { id: 10, remove: true },
              { id: 11, delete: true },
            ],
          };

          const updateDto = plainToInstance(UpdateTempleDto, validPatchPayload);
          const errors = await validate(updateDto, { whitelist: true, forbidNonWhitelisted: true });
          const errorMessages = extractErrorMessages(errors);

          expect(errorMessages).toHaveLength(0);
          expect(updateDto.services).toHaveLength(2);
          expect(updateDto.services![0].id).toBe(10);
          expect(updateDto.services![0].remove).toBe(true);
          expect(updateDto.services![1].id).toBe(11);
          expect(updateDto.services![1].delete).toBe(true);
        });
      });

      describe('PATCH /temples/:id - Editing Existing Service Details', () => {
        interface MockServiceItem {
          id: number;
          templeId: number | null;
          name: string;
          description?: string;
          durationMinutes?: number;
          isActive: boolean;
          deletedAt: Date | null;
          plans?: Record<string, unknown>;
        }

        let service10: MockServiceItem;
        let service11: MockServiceItem;
        let service12: MockServiceItem;

        beforeEach(() => {
          service10 = {
            id: 10,
            templeId: 1,
            name: 'Shri Hanuman Pooja',
            description: 'Original description',
            durationMinutes: 60,
            isActive: true,
            deletedAt: null,
            plans: { basic: { price: 501 } },
          };
          service11 = {
            id: 11,
            templeId: 1,
            name: 'Maha Rudrabhishek',
            description: 'Vedic Rudrabhishek',
            durationMinutes: 90,
            isActive: true,
            deletedAt: null,
            plans: { basic: { price: 1100 } },
          };
          service12 = {
            id: 12,
            templeId: 1,
            name: 'Navgrah Shanti',
            description: 'Navgrah pooja',
            durationMinutes: 120,
            isActive: true,
            deletedAt: null,
            plans: { basic: { price: 2100 } },
          };

          mockTempleRepo.findOne.mockResolvedValue({ ...sampleActiveTemple });
          mockTempleRepo.save.mockImplementation(async (t) => ({ ...sampleActiveTemple, ...t }));

          mockServiceRepo.find.mockImplementation(async (query: { where?: { id?: { _value?: number[] } | number[]; templeId?: number; deletedAt?: unknown } }) => {
            const list = [service10, service11, service12];
            if (query?.where?.id) {
              const rawIdVal = query.where.id;
              const ids: number[] = Array.isArray(rawIdVal)
                ? rawIdVal
                : rawIdVal && typeof rawIdVal === 'object' && '_value' in rawIdVal
                ? ((rawIdVal as { _value: number[] })._value)
                : [rawIdVal as number];
              return list.filter((s) => ids.includes(s.id));
            }
            if (query?.where?.templeId === 1) {
              return list.filter((s) => s.templeId === 1 && (!query?.where?.deletedAt || s.deletedAt === null));
            }
            return list;
          });

          mockServiceRepo.save.mockImplementation(async (s: MockServiceItem) => {
            if (s.id === 10) Object.assign(service10, s);
            if (s.id === 11) Object.assign(service11, s);
            if (s.id === 12) Object.assign(service12, s);
            return s;
          });
        });

        it('1. should update one existing service details via PATCH /temples/:id', async () => {
          const dto: UpdateTempleDto = {
            services: [
              {
                id: 10,
                name: 'Updated Hanuman Pooja',
                durationMinutes: 45,
              },
            ],
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          expect(result.statusCode).toBe(200);
          expect(mockServiceService.updateService).toHaveBeenCalledWith(
            10,
            expect.objectContaining({
              id: 10,
              name: 'Updated Hanuman Pooja',
              durationMinutes: 45,
            }),
            undefined,
            mockAdmin.id,
            expect.anything(),
            { skipNotifications: true, skipTempleValidation: true },
          );
        });

        it('2. should update multiple existing services in one request', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 10, name: 'Service 10 New Name', durationMinutes: 75 },
              { id: 11, description: 'Updated Rudrabhishek with special havan', durationMinutes: 100 },
            ],
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          expect(mockServiceService.updateService).toHaveBeenCalledTimes(2);
          expect(mockServiceService.updateService).toHaveBeenNthCalledWith(
            1,
            10,
            expect.objectContaining({ id: 10, name: 'Service 10 New Name' }),
            undefined,
            mockAdmin.id,
            expect.anything(),
            expect.anything(),
          );
          expect(mockServiceService.updateService).toHaveBeenNthCalledWith(
            2,
            11,
            expect.objectContaining({ id: 11, description: 'Updated Rudrabhishek with special havan' }),
            undefined,
            mockAdmin.id,
            expect.anything(),
            expect.anything(),
          );
        });

        it('3. should update both temple fields and service details in one request', async () => {
          const dto: UpdateTempleDto = {
            name: 'Shri Kashi Vishwanath Grand Temple',
            city: 'Varanasi',
            services: [
              { id: 10, name: 'Grand Shivling Pooja', durationMinutes: 90 },
            ],
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          expect(mockTempleRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
              name: 'Shri Kashi Vishwanath Grand Temple',
              city: 'Varanasi',
            }),
          );
          expect(mockServiceService.updateService).toHaveBeenCalledWith(
            10,
            expect.objectContaining({ id: 10, name: 'Grand Shivling Pooja' }),
            undefined,
            mockAdmin.id,
            expect.anything(),
            expect.anything(),
          );
        });

        it('4. should support partial updates preserving omitted service fields', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 10, durationMinutes: 150 },
            ],
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          expect(mockServiceService.updateService).toHaveBeenCalledWith(
            10,
            expect.objectContaining({
              id: 10,
              durationMinutes: 150,
            }),
            undefined,
            mockAdmin.id,
            expect.anything(),
            expect.anything(),
          );
          const passedDto = mockServiceService.updateService.mock.calls[0][1] as UpdateTempleServiceDto;
          expect(passedDto.name).toBeUndefined();
          expect(passedDto.description).toBeUndefined();
          expect(passedDto.plans).toBeUndefined();
        });

        it('5. should support mixed operations (update details, detach with remove: true, soft-delete with delete: true) in one request', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 10, name: 'Pooja 10 Updated' },
              { id: 11, remove: true },
              { id: 12, delete: true },
            ],
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          // Service 10 was updated
          expect(mockServiceService.updateService).toHaveBeenCalledWith(
            10,
            expect.objectContaining({ id: 10, name: 'Pooja 10 Updated' }),
            undefined,
            mockAdmin.id,
            expect.anything(),
            expect.anything(),
          );
          // Service 11 was detached (templeId = null)
          expect(service11.templeId).toBeNull();
          // Service 12 was soft-deleted (deletedAt = Date, isActive = false)
          expect(service12.deletedAt).toBeInstanceOf(Date);
          expect(service12.isActive).toBe(false);
        });

        it('6. should reject service with nonexistent ID (HTTP 400)', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 9999, name: 'Nonexistent service' },
            ],
          };

          await expect(service.updateTempleWithUser(1, dto, undefined, mockAdmin)).rejects.toThrow(
            BadRequestException,
          );
          await expect(service.updateTempleWithUser(1, dto, undefined, mockAdmin)).rejects.toThrow(
            'Service with id 9999 not found',
          );
        });

        it('7. should reject service belonging to another temple (HTTP 400)', async () => {
          service10.templeId = 99; // belongs to temple 99, not temple 1
          const dto: UpdateTempleDto = {
            services: [
              { id: 10, name: 'Cross-temple edit attempt' },
            ],
          };

          await expect(service.updateTempleWithUser(1, dto, undefined, mockAdmin)).rejects.toThrow(
            'Service with id 10 does not belong to temple 1',
          );
        });

        it('8. should reject client attempting to reassign service to another temple in payload (HTTP 400)', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 10, name: 'Reassignment attempt', templeId: 99 },
            ],
          };

          await expect(service.updateTempleWithUser(1, dto, undefined, mockAdmin)).rejects.toThrow(
            'Cannot reassign service with id 10 to another temple via temple update',
          );
        });

        it('9. should reject duplicate service IDs within the same request (HTTP 400)', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 10, name: 'First update' },
              { id: 10, name: 'Second duplicate update' },
            ],
          };

          await expect(service.updateTempleWithUser(1, dto, undefined, mockAdmin)).rejects.toThrow(
            'Duplicate service IDs are not allowed in the same request',
          );
        });

        it('10. should roll back entire transaction if a service operation fails', async () => {
          mockServiceService.updateService.mockRejectedValueOnce(
            new ConflictException('An online service with name "Duplicate Service Name" already exists'),
          );

          const dto: UpdateTempleDto = {
            name: 'Temple Name To Rollback',
            services: [
              { id: 10, name: 'Duplicate Service Name' },
            ],
          };

          await expect(service.updateTempleWithUser(1, dto, undefined, mockAdmin)).rejects.toThrow(
            ConflictException,
          );
        });

        it('11. should leave existing services untouched when services is omitted from request', async () => {
          const dto: UpdateTempleDto = {
            name: 'Temple Updated Name Only',
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          expect(mockServiceService.updateService).not.toHaveBeenCalled();
          expect(mockServiceRepo.save).not.toHaveBeenCalled();
        });

        it('12. should never perform physical deletion on service records', async () => {
          const dto: UpdateTempleDto = {
            services: [
              { id: 11, delete: true },
            ],
          };

          const result = await service.updateTempleWithUser(1, dto, undefined, mockAdmin);

          expect(result.success).toBe(true);
          expect(mockServiceRepo.save).toHaveBeenCalled();
          expect(service11.deletedAt).toBeInstanceOf(Date);
          expect(service11.isActive).toBe(false);
          expect((mockServiceRepo as unknown as Record<string, unknown>).delete).toBeUndefined();
        });
      });
    });
  });

  describe('Duplicate Temple Validation on POST and PATCH', () => {
    const mockAdminUser = { id: 1, role: USER_ROLE.ADMIN } as User;

    it('rejects POST /temple/add when a temple with the same name and address exists (case-insensitive with toLowerCase)', async () => {
      const existingTemple = {
        id: 1,
        name: 'Shri Somnath Temple',
        address: 'Prabhas Patan, Veraval, Gujarat',
      };
      mockTempleRepo.findDuplicateTemple.mockResolvedValueOnce(existingTemple);

      const dto = plainToInstance(CreateTempleDto, {
        name: '  shri somnath temple  ',
        address: '  prabhas patan, veraval, gujarat  ',
      });

      await expect(service.createTemple(dto, undefined, 99)).rejects.toThrow(
        new ConflictException('A temple with the same name and address already exists'),
      );
    });

    it('allows POST /temple/add when a temple has the same name but different address', async () => {
      mockTempleRepo.findDuplicateTemple.mockResolvedValue(null);

      const dto = plainToInstance(CreateTempleDto, {
        name: 'Shri Somnath Temple',
        address: 'Different Location Road, Surat',
      });

      const res = await service.createTemple(dto, undefined, 99);
      expect(res.success).toBe(true);
    });

    it('rejects PATCH /temple/:id when updating to the same name and address of another existing temple', async () => {
      const currentTemple = {
        id: 2,
        name: 'Somnath Mandir',
        address: 'Old Address',
        deletedAt: null,
      };
      const anotherTemple = {
        id: 1,
        name: 'Shri Somnath Temple',
        address: 'Prabhas Patan, Veraval, Gujarat',
      };

      mockTempleRepo.findOne.mockResolvedValueOnce({ ...currentTemple });
      mockTempleRepo.findDuplicateTemple.mockResolvedValueOnce(anotherTemple);

      const dto: UpdateTempleDto = {
        name: 'shri somnath temple',
        address: 'prabhas patan, veraval, gujarat',
      };

      await expect(
        service.updateTempleWithUser(2, dto, undefined, mockAdminUser),
      ).rejects.toThrow(
        new ConflictException('A temple with the same name and address already exists'),
      );
    });

    it('allows PATCH /temple/:id when updating own details with same name and address (no self-collision)', async () => {
      const currentTemple = {
        id: 1,
        name: 'Shri Somnath Temple',
        address: 'Prabhas Patan, Veraval, Gujarat',
        deletedAt: null,
      };

      mockTempleRepo.findOne.mockResolvedValue({ ...currentTemple });
      mockTempleRepo.findDuplicateTemple.mockResolvedValue(null);

      const dto: UpdateTempleDto = {
        name: 'Shri Somnath Temple',
        address: 'Prabhas Patan, Veraval, Gujarat',
      };

      const res = await service.updateTempleWithUser(1, dto, undefined, mockAdminUser);
      expect(res.success).toBe(true);
    });

    it('allows PATCH /temple/:id when updating name but address remains distinct', async () => {
      const currentTemple = {
        id: 2,
        name: 'Old Name',
        address: 'Unique Address 456',
        deletedAt: null,
      };

      mockTempleRepo.findOne.mockResolvedValue({ ...currentTemple });
      mockTempleRepo.findDuplicateTemple.mockResolvedValue(null);

      const dto: UpdateTempleDto = {
        name: 'Shri Somnath Temple',
      };

      const res = await service.updateTempleWithUser(2, dto, undefined, mockAdminUser);
      expect(res.success).toBe(true);
    });
  });
});
