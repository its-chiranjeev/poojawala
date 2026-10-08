import { Test, TestingModule } from '@nestjs/testing';
import { TempleController } from './temple.controller';
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

  beforeEach(async () => {
    mockTempleService = {
      createTemple: jest.fn().mockResolvedValue({
        success: true,
        message: 'Temple created successfully',
        data: { id: 1, name: 'Hanuman Mandir' },
      }),
      updateTemple: jest.fn().mockResolvedValue({
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
    it('22. should protect createTemple with JwtAuthGuard, RolesGuard and USER_ROLE.ADMIN', () => {
      const target = controller.createTemple;
      const roles = Reflect.getMetadata('roles', target);
      expect(roles).toEqual([USER_ROLE.ADMIN]);

      const guards = Reflect.getMetadata('__guards__', target);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('23. should protect updateTemple with JwtAuthGuard, RolesGuard and USER_ROLE.ADMIN', () => {
      const target = controller.updateTemple;
      const roles = Reflect.getMetadata('roles', target);
      expect(roles).toEqual([USER_ROLE.ADMIN]);

      const guards = Reflect.getMetadata('__guards__', target);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('24. should protect deleteTemple with JwtAuthGuard, RolesGuard and USER_ROLE.ADMIN', () => {
      const target = controller.deleteTemple;
      const roles = Reflect.getMetadata('roles', target);
      expect(roles).toEqual([USER_ROLE.ADMIN]);

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

      expect(mockTempleService.createTemple).toHaveBeenCalledWith(dto, undefined, 10);
      expect(res.success).toBe(true);
    });

    it('should update temple when called by admin', async () => {
      const req: any = { user: mockAdminUser };
      const dto: UpdateTempleDto = { name: 'Updated' };

      const res = await controller.updateTemple(req, 1, dto, undefined);

      expect(mockTempleService.updateTemple).toHaveBeenCalledWith(1, dto, undefined, 10);
      expect(res.success).toBe(true);
    });

    it('should delete temple when called by admin', async () => {
      const req: any = { user: mockAdminUser };

      const res = await controller.deleteTemple(req, 1);

      expect(mockTempleService.deleteTemple).toHaveBeenCalledWith(1, 10);
      expect(res.success).toBe(true);
    });

    it('should handle public getTemples without auth (isAdmin = false)', async () => {
      const req: any = { user: undefined };
      const query: GetTemplesQueryDto = { page: 1, limit: 10 };

      const res = await controller.getTemples(req, query);

      expect(mockTempleService.getTemples).toHaveBeenCalledWith(query, false);
      expect(res.success).toBe(true);
    });

    it('should handle admin getTemples with admin user (isAdmin = true)', async () => {
      const req: any = { user: mockAdminUser };
      const query: GetTemplesQueryDto = { page: 1, limit: 10 };

      const res = await controller.getTemples(req, query);

      expect(mockTempleService.getTemples).toHaveBeenCalledWith(query, true);
      expect(res.success).toBe(true);
    });

    it('should handle public getTempleById without auth (isAdmin = false)', async () => {
      const req: any = { user: undefined };

      const res = await controller.getTempleById(req, 1);

      expect(mockTempleService.getTempleById).toHaveBeenCalledWith(1, false);
      expect(res.success).toBe(true);
    });

    it('should handle admin getTempleById with admin user (isAdmin = true)', async () => {
      const req: any = { user: mockAdminUser };

      const res = await controller.getTempleById(req, 1);

      expect(mockTempleService.getTempleById).toHaveBeenCalledWith(1, true);
      expect(res.success).toBe(true);
    });
  });
});
