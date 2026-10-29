import { Test, TestingModule } from '@nestjs/testing';
import { TempleController, TempleUpdatePipe } from './temple.controller';
import { TempleService } from './temple.service';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from '@poojawala/common';
import { USER_ROLE, User } from '@poojawala/entities';
import { CreateTempleDto, UpdateTempleDto, GetTemplesQueryDto } from '@poojawala/dtos';

describe('TempleController', () => {
  let controller: TempleController;
  let mockTempleService: {
    createTemple: jest.Mock;
    updateTemple: jest.Mock;
    deleteTemple: jest.Mock;
    getTemples: jest.Mock;
    getTempleById: jest.Mock;
  };

  const mockAdminUser = {
    id: 10,
    role: USER_ROLE.ADMIN,
  } as User;

  const mockCustomerUser = {
    id: 20,
    role: USER_ROLE.CUSTOMER,
  } as User;

  const mockPurohitUser = {
    id: 50,
    role: USER_ROLE.PUROHIT,
  } as User;

  beforeEach(async () => {
    mockTempleService = {
      createTemple: jest.fn().mockResolvedValue({
        success: true,
        message: 'Temple created successfully',
        data: { id: 1, name: 'Hanuman Mandir' },
      }),
      createTempleWithUser: jest.fn().mockResolvedValue({
        success: true,
        message: 'Temple created successfully',
        data: { id: 1, name: 'Hanuman Mandir' },
      }),
      updateTemple: jest.fn().mockResolvedValue({
        success: true,
        message: 'Temple updated successfully',
        data: { id: 1, name: 'Updated Mandir' },
      }),
      updateTempleWithUser: jest.fn().mockResolvedValue({
        success: true,
        message: 'Temple updated successfully',
        data: { id: 1, name: 'Updated Mandir' },
      }),
      deleteTemple: jest.fn().mockResolvedValue({
        success: true,
        message: 'Temple deleted successfully',
      }),
      getTemples: jest.fn().mockResolvedValue({
        success: true,
        data: [{ id: 1, name: 'Hanuman Mandir' }],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
      getTempleById: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 1, name: 'Hanuman Mandir' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TempleController],
      providers: [
        {
          provide: TempleService,
          useValue: mockTempleService,
        },
      ],
    }).compile();

    controller = module.get<TempleController>(TempleController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. AUTHORIZATION & ROUTE GUARDS METADATA
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Authorization Metadata', () => {
    it('22. should protect createTemple with JwtAuthGuard, RolesGuard and USER_ROLE.ADMIN, USER_ROLE.PUROHIT', () => {
      const target = controller.createTemple;
      const roles = Reflect.getMetadata('roles', target);
      expect(roles).toEqual([USER_ROLE.ADMIN, USER_ROLE.PUROHIT]);

      const guards = Reflect.getMetadata('__guards__', target);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('23. should protect updateTemple with JwtAuthGuard, RolesGuard and USER_ROLE.ADMIN, USER_ROLE.PUROHIT', () => {
      const target = controller.updateTemple;
      const roles = Reflect.getMetadata('roles', target);
      expect(roles).toEqual([USER_ROLE.ADMIN, USER_ROLE.PUROHIT]);

      const guards = Reflect.getMetadata('__guards__', target);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('24. should protect deleteTemple with JwtAuthGuard, RolesGuard and USER_ROLE.ADMIN, USER_ROLE.PUROHIT', () => {
      const target = controller.deleteTemple;
      const roles = Reflect.getMetadata('roles', target);
      expect(roles).toEqual([USER_ROLE.ADMIN, USER_ROLE.PUROHIT]);

      const guards = Reflect.getMetadata('__guards__', target);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('25. should configure shared read endpoints with OptionalJwtAuthGuard', () => {
      const getTemplesGuards = Reflect.getMetadata('__guards__', controller.getTemples);
      expect(getTemplesGuards).toContain(OptionalJwtAuthGuard);

      const getTempleByIdGuards = Reflect.getMetadata('__guards__', controller.getTempleById);
      expect(getTempleByIdGuards).toContain(OptionalJwtAuthGuard);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTROLLER METHOD INVOCATIONS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Controller Execution', () => {
    it('should create temple when called by admin', async () => {
      const req: any = { user: mockAdminUser };
      const dto: CreateTempleDto = { name: 'New Temple' };

      const res = await controller.createTemple(req, dto, undefined);

      expect(mockTempleService.createTempleWithUser).toHaveBeenCalledWith(dto, undefined, mockAdminUser);
      expect(res.success).toBe(true);
    });

    it('should update temple when called by admin', async () => {
      const req: any = { user: mockAdminUser };
      const dto: UpdateTempleDto = { name: 'Updated' };

      const res = await controller.updateTemple(req, 1, dto, undefined);

      expect(mockTempleService.updateTempleWithUser).toHaveBeenCalledWith(1, dto, undefined, mockAdminUser);
      expect(res.success).toBe(true);
    });

    it('should delete temple when called by admin', async () => {
      const req: any = { user: mockAdminUser };

      const res = await controller.deleteTemple(req, 1);

      expect(mockTempleService.deleteTemple).toHaveBeenCalledWith(1, mockAdminUser);
      expect(res.success).toBe(true);
    });

    it('should delete temple when called by purohit', async () => {
      const mockPurohitUser = { id: 30, role: USER_ROLE.PUROHIT } as User;
      const req = { user: mockPurohitUser } as unknown as Parameters<typeof controller.deleteTemple>[0];

      const res = await controller.deleteTemple(req, 1);

      expect(mockTempleService.deleteTemple).toHaveBeenCalledWith(1, mockPurohitUser);
      expect(res.success).toBe(true);
    });

    it('should handle public getTemples without auth (req.user = undefined)', async () => {
      const req: any = { user: undefined };
      const query: GetTemplesQueryDto = { page: 1, limit: 10 };

      const res = await controller.getTemples(req, query);

      expect(mockTempleService.getTemples).toHaveBeenCalledWith(query, undefined);
      expect(res.success).toBe(true);
    });

    it('should handle admin getTemples with admin user (req.user = mockAdminUser)', async () => {
      const req: any = { user: mockAdminUser };
      const query: GetTemplesQueryDto = { page: 1, limit: 10 };

      const res = await controller.getTemples(req, query);

      expect(mockTempleService.getTemples).toHaveBeenCalledWith(query, mockAdminUser);
      expect(res.success).toBe(true);
    });

    it('should handle purohit getTemples with purohit user (req.user = mockPurohitUser)', async () => {
      const req: any = { user: mockPurohitUser };
      const query: GetTemplesQueryDto = { page: 1, limit: 10 };

      const res = await controller.getTemples(req, query);

      expect(mockTempleService.getTemples).toHaveBeenCalledWith(query, mockPurohitUser);
      expect(res.success).toBe(true);
    });

    it('should handle public getTempleById without auth (req.user = undefined)', async () => {
      const req: any = { user: undefined };

      const res = await controller.getTempleById(req, 1);

      expect(mockTempleService.getTempleById).toHaveBeenCalledWith(1, undefined);
      expect(res.success).toBe(true);
    });

    it('should pass aartis to templeService on createTemple', async () => {
      const req: any = { user: mockAdminUser };
      const dto: CreateTempleDto = {
        name: 'Temple with Aartis',
        aartis: [{ name: 'Aarti 1', time: '06:00:00' }],
      };

      await controller.createTemple(req, dto, undefined);

      expect(mockTempleService.createTempleWithUser).toHaveBeenCalledWith(dto, undefined, mockAdminUser);
    });

    it('should pass aartis to templeService on updateTemple', async () => {
      const req: any = { user: mockAdminUser };
      const dto: UpdateTempleDto = {
        aartis: [{ id: 10, name: 'Updated Aarti' }, { name: 'New Aarti' }],
      };

      await controller.updateTemple(req, 1, dto, undefined);

      expect(mockTempleService.updateTempleWithUser).toHaveBeenCalledWith(1, dto, undefined, mockAdminUser);
    });

    it('TempleUpdatePipe should transform array payload into object with aartis property', async () => {
      const pipe = new TempleUpdatePipe();
      const rawArray = [
        { id: 5, name: 'Mangala Aarti', time: '03:15:00' },
        { id: 6, name: 'Bhog Aarti', time: '12:00:00' },
        { name: 'Sandhya Aarti', time: '19:30:00' },
      ];

      const result = await pipe.transform(rawArray, {
        type: 'body',
        metatype: UpdateTempleDto,
      });

      expect(result).toBeInstanceOf(UpdateTempleDto);
      expect(result.aartis).toBeDefined();
      expect(result.aartis?.length).toBe(3);
      expect(result.aartis?.[0].id).toBe(5);
      expect(result.aartis?.[0].name).toBe('Mangala Aarti');
    });

    it('TempleUpdatePipe should safely parse multipart aartis JSON string into array', async () => {
      const pipe = new TempleUpdatePipe();
      const rawMultipartBody = {
        name: 'Somnath Temple',
        aartis: JSON.stringify([
          { id: 5, name: 'Mangala Aarti', time: '03:15:00' },
          { id: 6, name: 'Bhog Aarti', time: '12:00:00' },
          { name: 'Sandhya Aarti', time: '19:30:00' },
        ]),
      };

      const result = await pipe.transform(rawMultipartBody, {
        type: 'body',
        metatype: UpdateTempleDto,
      });

      expect(result).toBeInstanceOf(UpdateTempleDto);
      expect(result.aartis).toBeDefined();
      expect(result.aartis?.length).toBe(3);
      expect(result.aartis?.[0].id).toBe(5);
      expect(result.aartis?.[0].name).toBe('Mangala Aarti');
      expect(result.aartis?.[0].time).toBe('03:15:00');
    });

    it('TempleUpdatePipe should throw 400 BadRequestException for invalid JSON aartis', async () => {
      const pipe = new TempleUpdatePipe();
      const invalidMultipartBody = {
        name: 'Somnath Temple',
        aartis: '{ invalid json',
      };

      await expect(
        pipe.transform(invalidMultipartBody, {
          type: 'body',
          metatype: UpdateTempleDto,
        }),
      ).rejects.toThrow('Invalid JSON format for aartis');
    });

    it('TempleUpdatePipe should safely parse multipart services JSON string into array', async () => {
      const pipe = new TempleUpdatePipe();
      const rawMultipartBody = {
        name: 'Somnath Temple',
        services: JSON.stringify([
          {
            name: 'Special Rudrabhishek',
            plans: { basic: { price: 2100 } },
            commissionPercentage: 10,
            durationMinutes: 60,
            requiresVenue: false,
          },
        ]),
      };

      const result = await pipe.transform(rawMultipartBody, {
        type: 'body',
        metatype: CreateTempleDto,
      });

      expect(result).toBeInstanceOf(CreateTempleDto);
      expect(result.services).toBeDefined();
      expect(result.services?.length).toBe(1);
      expect(result.services?.[0].name).toBe('Special Rudrabhishek');
      expect(result.services?.[0].commissionPercentage).toBe(10);
    });

    it('TempleUpdatePipe should throw 400 BadRequestException for invalid JSON services', async () => {
      const pipe = new TempleUpdatePipe();
      const invalidMultipartBody = {
        name: 'Somnath Temple',
        services: '{ invalid json for services',
      };

      await expect(
        pipe.transform(invalidMultipartBody, {
          type: 'body',
          metatype: CreateTempleDto,
        }),
      ).rejects.toThrow('Invalid JSON format for services');
    });

    it('TempleUpdatePipe should ignore null or empty string for services', async () => {
      const pipe = new TempleUpdatePipe();
      const bodyWithEmpty = {
        name: 'Somnath Temple',
        services: '   ',
      };

      const result = await pipe.transform(bodyWithEmpty, {
        type: 'body',
        metatype: CreateTempleDto,
      });

      expect(result).toBeInstanceOf(CreateTempleDto);
      expect(result.services).toBeUndefined();
    });
  });
});
