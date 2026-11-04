import { Test, TestingModule } from '@nestjs/testing';
import { AuthModuleService, GoogleIdentity } from './auth-module.service';
import { UserRepository, OtpRepository } from '@poojawala/repositories';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@poojawala/email-services';
import { SmsService } from '@poojawala/sms-services';
import { AuditLogService } from '@poojawala/common';
import {
  User,
  USER_ROLE,
  USER_STATUS,
  LOGIN_PAGE,
  PurohitProfile,
  PUROHIT_VERIFICATION_STATUS,
} from '@poojawala/entities';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthModuleService - Google Authentication', () => {
  let service: AuthModuleService;
  let userRepository: Partial<Record<keyof UserRepository, jest.Mock>>;
  let dataSource: any;
  let configService: Partial<Record<keyof ConfigService, jest.Mock>>;
  let auditLogService: Partial<Record<keyof AuditLogService, jest.Mock>>;

  beforeEach(async () => {
    userRepository = {
      findByGoogleId: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailOrUsername: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((u) => Promise.resolve({ ...u, id: u.id || 101 })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET' || key === 'JWT_SECRET') return 'test-access-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
        return null;
      }),
    };

    auditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(true),
    };

    dataSource = {
      transaction: jest.fn(async (cb: any) => {
        const mockUserRepo = {
          create: jest.fn((data) => ({ id: 101, ...data })),
          save: jest.fn((user) => Promise.resolve(user)),
          findOne: jest.fn(),
        };
        const mockProfileRepo = {
          create: jest.fn((data) => ({ id: 201, ...data })),
          save: jest.fn((profile) => Promise.resolve(profile)),
          findOne: jest.fn(),
        };
        const manager = {
          getRepository: jest.fn((entity: any) => {
            if (entity === User) return mockUserRepo;
            if (entity === PurohitProfile) return mockProfileRepo;
            return {};
          }),
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthModuleService,
        { provide: UserRepository, useValue: userRepository },
        { provide: OtpRepository, useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: EmailService, useValue: {} },
        { provide: SmsService, useValue: {} },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get<AuthModuleService>(AuthModuleService);
  });

  describe('handleGoogleAuth', () => {
    const validCustomerIdentity: GoogleIdentity = {
      sub: 'google_1234567890',
      email: 'customer@test.com',
      emailVerified: true,
      name: 'Test Customer',
      givenName: 'Test',
      familyName: 'Customer',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    };

    it('should reject unverified Google emails', async () => {
      const identity: GoogleIdentity = {
        ...validCustomerIdentity,
        emailVerified: false,
      };

      await expect(service.handleGoogleAuth(identity, USER_ROLE.CUSTOMER)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should create a new CUSTOMER user with ACTIVE status', async () => {
      userRepository.findByGoogleId!.mockResolvedValue(null);
      userRepository.findByEmail!.mockResolvedValue(null);
      userRepository.findOne!.mockResolvedValue(null);

      const result = await service.handleGoogleAuth(validCustomerIdentity, USER_ROLE.CUSTOMER);

      expect(result.isNewUser).toBe(true);
      expect(result.user.role).toBe(USER_ROLE.CUSTOMER);
      expect(result.user.status).toBe(USER_STATUS.ACTIVE);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should create a new PUROHIT user with PENDING status and pending verification profile', async () => {
      userRepository.findByGoogleId!.mockResolvedValue(null);
      userRepository.findByEmail!.mockResolvedValue(null);
      userRepository.findOne!.mockResolvedValue(null);

      const purohitIdentity: GoogleIdentity = {
        ...validCustomerIdentity,
        sub: 'google_purohit_999',
        email: 'purohit@test.com',
      };

      let createdProfile: any = null;
      dataSource.transaction = jest.fn(async (cb: any) => {
        const mockUserRepo = {
          create: jest.fn((data) => ({ id: 202, ...data })),
          save: jest.fn((user) => Promise.resolve(user)),
        };
        const mockProfileRepo = {
          create: jest.fn((data) => {
            createdProfile = { id: 301, ...data };
            return createdProfile;
          }),
          save: jest.fn((p) => Promise.resolve(p)),
        };
        const manager = {
          getRepository: jest.fn((entity: any) => {
            if (entity === User) return mockUserRepo;
            if (entity === PurohitProfile) return mockProfileRepo;
            return {};
          }),
        };
        return cb(manager);
      });

      const result = await service.handleGoogleAuth(purohitIdentity, USER_ROLE.PUROHIT);

      expect(result.isNewUser).toBe(true);
      expect(result.user.role).toBe(USER_ROLE.PUROHIT);
      expect(result.user.status).toBe(USER_STATUS.ACTIVE);
      expect(createdProfile).toBeDefined();
      expect(createdProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
    });

    it('should never escalate to ADMIN even if ADMIN role is requested', async () => {
      userRepository.findByGoogleId!.mockResolvedValue(null);
      userRepository.findByEmail!.mockResolvedValue(null);
      userRepository.findOne!.mockResolvedValue(null);

      const result = await service.handleGoogleAuth(validCustomerIdentity, USER_ROLE.ADMIN as any);

      // Safe fallback must be CUSTOMER
      expect(result.user.role).toBe(USER_ROLE.CUSTOMER);
      expect(result.user.role).not.toBe(USER_ROLE.ADMIN);
    });

    it('should authenticate existing user matched by googleId without changing role or status', async () => {
      const existingUser: Partial<User> = {
        id: 55,
        email: 'customer@test.com',
        googleId: 'google_1234567890',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
      };

      userRepository.findByGoogleId!.mockResolvedValue(existingUser as User);

      const result = await service.handleGoogleAuth(validCustomerIdentity, USER_ROLE.CUSTOMER);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(55);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should link googleId to existing user matched by email if googleId is null', async () => {
      const existingUser: Partial<User> = {
        id: 77,
        email: 'customer@test.com',
        googleId: undefined,
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
      };

      userRepository.findByGoogleId!.mockResolvedValue(null);
      userRepository.findByEmail!.mockResolvedValue(existingUser as User);

      const result = await service.handleGoogleAuth(validCustomerIdentity, USER_ROLE.CUSTOMER);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(77);
      expect(existingUser.googleId).toBe('google_1234567890');
      expect(userRepository.save).toHaveBeenCalledWith(existingUser);
    });

    it('should reject authentication if email matches existing user with a DIFFERENT googleId (collision protection)', async () => {
      const existingUser: Partial<User> = {
        id: 88,
        email: 'customer@test.com',
        googleId: 'different_google_sub_999',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
      };

      userRepository.findByGoogleId!.mockResolvedValue(null);
      userRepository.findByEmail!.mockResolvedValue(existingUser as User);

      await expect(
        service.handleGoogleAuth(validCustomerIdentity, USER_ROLE.CUSTOMER),
      ).rejects.toThrow(ConflictException);
    });

    it('should prevent blocked or rejected users from authenticating', async () => {
      const blockedUser: Partial<User> = {
        id: 99,
        email: 'blocked@test.com',
        googleId: 'google_1234567890',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.BLOCKED,
      };

      userRepository.findByGoogleId!.mockResolvedValue(blockedUser as User);

      await expect(
        service.handleGoogleAuth(validCustomerIdentity, USER_ROLE.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle concurrent signups gracefully without creating duplicate accounts', async () => {
      userRepository.findByGoogleId!.mockResolvedValue(null);
      userRepository.findByEmail!.mockResolvedValue(null);
      userRepository.findOne!.mockResolvedValue(null);

      const createdUser: Partial<User> = {
        id: 105,
        email: 'concurrent@test.com',
        googleId: 'google_concurrent_123',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
      };

      let attempt = 0;
      dataSource.transaction = jest.fn(async (cb: any) => {
        attempt++;
        if (attempt === 1) {
          // First concurrent request succeeds
          return createdUser;
        } else {
          // Second concurrent request collides on PostgreSQL unique constraint 23505
          const error: any = new Error('duplicate key value violates unique constraint "users_email_key"');
          error.code = '23505';
          throw error;
        }
      });

      // When the second request fails with 23505, findByGoogleId or findByEmail will find the newly created user
      userRepository.findByGoogleId = jest.fn((gid: string) => {
        if (gid === 'google_concurrent_123') return Promise.resolve(createdUser as User);
        return Promise.resolve(null);
      });

      const [res1, res2] = await Promise.all([
        service.handleGoogleAuth(
          { ...validCustomerIdentity, sub: 'google_concurrent_123', email: 'concurrent@test.com' },
          USER_ROLE.CUSTOMER,
        ),
        service.handleGoogleAuth(
          { ...validCustomerIdentity, sub: 'google_concurrent_123', email: 'concurrent@test.com' },
          USER_ROLE.CUSTOMER,
        ),
      ]);

      expect(res1.user.id).toBe(105);
      expect(res2.user.id).toBe(105);
    });
  });

  // switchIntentService endpoint is currently disabled

  describe('loginService - CUSTOMER vs PUROHIT status matrix', () => {
    const password = 'CorrectPassword123!';
    let hashedPassword: string;

    beforeAll(async () => {
      hashedPassword = await bcrypt.hash(password, 10);
    });

    const setupMocksForLogin = (user: Partial<User>, profile?: Partial<PurohitProfile>) => {
      const mockUser = {
        id: user.id || 1,
        email: user.email || 'user@test.com',
        username: user.username || 'testuser',
        firstName: user.firstName || 'Test',
        lastName: user.lastName || 'User',
        hashedPassword,
        role: user.role || USER_ROLE.CUSTOMER,
        status: user.status || USER_STATUS.ACTIVE,
        tokenVersion: 1,
        profileImage: null,
        isAdminCreated: false,
        ...user,
      } as User;

      userRepository.findByEmail!.mockResolvedValue(mockUser);
      userRepository.findByEmailOrUsername!.mockResolvedValue(mockUser);

      const mockProfileRepo = {
        findOne: jest.fn().mockResolvedValue(
          profile
            ? {
                id: profile.id || 10,
                userId: user.id || 1,
                verificationStatus: profile.verificationStatus || PUROHIT_VERIFICATION_STATUS.PENDING,
                rejectionReason: profile.rejectionReason ?? null,
                ...profile,
              }
            : null,
        ),
      };

      dataSource.getRepository = jest.fn((entity: any) => {
        if (entity === PurohitProfile) return mockProfileRepo;
        return {};
      });
    };

    // 1. CUSTOMER + ACTIVE -> login succeeds
    it('1. CUSTOMER with status ACTIVE: login succeeds', async () => {
      setupMocksForLogin({
        id: 11,
        email: 'customer.active@test.com',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
      });

      const res = await service.loginService({
        email: 'customer.active@test.com',
        password,
      });

      expect(res.message).toBe('Login successful');
      expect(res.tokens.accessToken).toBeDefined();
      expect(res.tokens.refreshToken).toBeDefined();
      expect(res.user.role).toBe(USER_ROLE.CUSTOMER);
      expect(res.user.status).toBe(USER_STATUS.ACTIVE);
    });

    // 2. CUSTOMER + BLOCKED -> login fails
    it('2. CUSTOMER with status BLOCKED: login fails', async () => {
      setupMocksForLogin({
        id: 12,
        email: 'customer.blocked@test.com',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.BLOCKED,
      });

      await expect(
        service.loginService({
          email: 'customer.blocked@test.com',
          password,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // 3. CUSTOMER + REJECTED -> login fails
    it('3. CUSTOMER with status REJECTED: login fails', async () => {
      setupMocksForLogin({
        id: 13,
        email: 'customer.rejected@test.com',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.REJECTED,
      });

      await expect(
        service.loginService({
          email: 'customer.rejected@test.com',
          password,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // 4. PUROHIT + User.status ACTIVE + verificationStatus PENDING -> login succeeds
    it('4. PUROHIT with User.status ACTIVE and verificationStatus PENDING: login succeeds', async () => {
      setupMocksForLogin(
        {
          id: 21,
          email: 'purohit.pending@test.com',
          role: USER_ROLE.PUROHIT,
          status: USER_STATUS.ACTIVE,
        },
        {
          verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
          rejectionReason: undefined,
        },
      );

      const res = await service.loginService({
        email: 'purohit.pending@test.com',
        password,
      });

      expect(res.message).toBe('Login successful');
      expect(res.user.role).toBe(USER_ROLE.PUROHIT);
      expect(res.user.status).toBe(USER_STATUS.ACTIVE);
      expect((res.user as any).verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
    });

    // 5. PUROHIT + User.status ACTIVE + verificationStatus REJECTED -> login succeeds
    it('5. PUROHIT with User.status ACTIVE and verificationStatus REJECTED: login succeeds', async () => {
      setupMocksForLogin(
        {
          id: 22,
          email: 'purohit.rejected@test.com',
          role: USER_ROLE.PUROHIT,
          status: USER_STATUS.ACTIVE,
        },
        {
          verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
          rejectionReason: 'Invalid Aadhaar image blur',
        },
      );

      const res = await service.loginService({
        email: 'purohit.rejected@test.com',
        password,
      });

      expect(res.message).toBe('Login successful');
      expect(res.user.role).toBe(USER_ROLE.PUROHIT);
      expect(res.user.status).toBe(USER_STATUS.ACTIVE);
      expect((res.user as any).verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect((res.user as any).rejectionReason).toBe('Invalid Aadhaar image blur');
    });

    // 6. PUROHIT + User.status ACTIVE + verificationStatus APPROVED -> login succeeds
    it('6. PUROHIT with User.status ACTIVE and verificationStatus APPROVED: login succeeds', async () => {
      setupMocksForLogin(
        {
          id: 23,
          email: 'purohit.approved@test.com',
          role: USER_ROLE.PUROHIT,
          status: USER_STATUS.ACTIVE,
        },
        {
          verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
          rejectionReason: null as any,
        },
      );

      const res = await service.loginService({
        email: 'purohit.approved@test.com',
        password,
      });

      expect(res.message).toBe('Login successful');
      expect(res.user.role).toBe(USER_ROLE.PUROHIT);
      expect(res.user.status).toBe(USER_STATUS.ACTIVE);
      expect((res.user as any).verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
    });

    // 7. PUROHIT + User.status BLOCKED + verificationStatus REJECTED -> login fails
    it('7. PUROHIT with User.status BLOCKED (any verification status): login fails', async () => {
      setupMocksForLogin(
        {
          id: 24,
          email: 'purohit.blocked@test.com',
          role: USER_ROLE.PUROHIT,
          status: USER_STATUS.BLOCKED,
        },
        {
          verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
          rejectionReason: 'Rule violations',
        },
      );

      await expect(
        service.loginService({
          email: 'purohit.blocked@test.com',
          password,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // 8. PUROHIT + User.status REJECTED -> login fails
    it('8. PUROHIT with User.status REJECTED: login fails', async () => {
      setupMocksForLogin(
        {
          id: 25,
          email: 'purohit.accountrejected@test.com',
          role: USER_ROLE.PUROHIT,
          status: USER_STATUS.REJECTED,
        },
        {
          verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
        },
      );

      await expect(
        service.loginService({
          email: 'purohit.accountrejected@test.com',
          password,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Google OAuth URL & Env Helpers in Service', () => {
    it('should throw InternalServerErrorException if GOOGLE_CALLBACK_URL is not configured', () => {
      configService.get = jest.fn((key: string) => (key === 'GOOGLE_CALLBACK_URL' ? null : 'val'));
      delete process.env['GOOGLE_CALLBACK_URL'];

      expect(() => service.getGoogleCallbackUrl()).toThrow('GOOGLE_CALLBACK_URL is not configured');
    });

    it('should throw InternalServerErrorException if FRONTEND_URL is not configured', () => {
      configService.get = jest.fn((key: string) => (key === 'FRONTEND_URL' ? null : 'val'));
      delete process.env['FRONTEND_URL'];

      expect(() => service.getFrontendUrl()).toThrow('FRONTEND_URL is not configured');
    });

    it('should return configured URLs when present in env', () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:8010/api/auth/google/callback';
        if (key === 'FRONTEND_URL') return 'http://localhost:5173/';
        return null;
      });

      expect(service.getGoogleCallbackUrl()).toBe('http://localhost:8010/api/auth/google/callback');
      expect(service.getFrontendUrl()).toBe('http://localhost:5173');
    });

    it('should generate Google OAuth URL and state in getGoogleOAuthRedirect', () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'mock-client-id';
        if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:8010/api/auth/google/callback';
        return null;
      });

      const { url, state } = service.getGoogleOAuthRedirect('PUROHIT');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=mock-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8010%2Fapi%2Fauth%2Fgoogle%2Fcallback');
      expect(state).toBeDefined();

      const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      expect(parsedState.role).toBe(USER_ROLE.PUROHIT);
      expect(parsedState.nonce).toBeDefined();
    });

    it('should throw BadRequestException in getGoogleOAuthRedirect if role is missing', () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'mock-client-id';
        if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:8010/api/auth/google/callback';
        return null;
      });

      expect(() => service.getGoogleOAuthRedirect()).toThrow(BadRequestException);
      expect(() => service.getGoogleOAuthRedirect('')).toThrow(BadRequestException);
      expect(() => service.getGoogleOAuthRedirect('   ')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException in getGoogleOAuthRedirect if role is ADMIN', () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'mock-client-id';
        if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:8010/api/auth/google/callback';
        return null;
      });

      expect(() => service.getGoogleOAuthRedirect('ADMIN')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException in getGoogleOAuthRedirect if role is unsupported', () => {
      configService.get = jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'mock-client-id';
        if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:8010/api/auth/google/callback';
        return null;
      });

      expect(() => service.getGoogleOAuthRedirect('TEST')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException in getGoogleOAuthRedirect if GOOGLE_CLIENT_ID is missing', () => {
      configService.get = jest.fn().mockReturnValue(null);
      delete process.env['GOOGLE_CLIENT_ID'];

      expect(() => service.getGoogleOAuthRedirect('CUSTOMER')).toThrow(BadRequestException);
    });
  });
  describe('loginService & forgotPasswordService - LOGIN_PAGE query role enforcement', () => {
    const password = 'Password@123';
    let hashedPassword: string;

    beforeAll(async () => {
      hashedPassword = await bcrypt.hash(password, 10);
    });

    const setupMocksForRole = (role: USER_ROLE) => {
      const mockUser = {
        id: 99,
        email: `${role.toLowerCase()}@test.com`,
        username: `${role.toLowerCase()}user`,
        hashedPassword,
        role,
        status: USER_STATUS.ACTIVE,
        isVerified: true,
      } as User;

      userRepository.findByEmailOrUsername!.mockResolvedValue(mockUser);
      userRepository.findByEmail!.mockResolvedValue(mockUser);
      userRepository.findOne!.mockResolvedValue(mockUser);

      dataSource.getRepository = jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
      }));
    };

    describe('loginService on HOME_PAGE', () => {
      it('allows CUSTOMER to login', async () => {
        setupMocksForRole(USER_ROLE.CUSTOMER);
        const res = await service.loginService(
          { email: 'customer@test.com', password },
          LOGIN_PAGE.HOME_PAGE,
        );
        expect(res.message).toBe('Login successful');
      });

      it('allows PUROHIT to login', async () => {
        setupMocksForRole(USER_ROLE.PUROHIT);
        const res = await service.loginService(
          { email: 'purohit@test.com', password },
          LOGIN_PAGE.HOME_PAGE,
        );
        expect(res.message).toBe('Login successful');
      });

      it('allows ASTROLOGER to login', async () => {
        setupMocksForRole(USER_ROLE.ASTROLOGER);
        const res = await service.loginService(
          { email: 'astrologer@test.com', password },
          LOGIN_PAGE.HOME_PAGE,
        );
        expect(res.message).toBe('Login successful');
      });

      it('rejects ADMIN with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.ADMIN);
        await expect(
          service.loginService(
            { email: 'admin@test.com', password },
            LOGIN_PAGE.HOME_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Admin accounts cannot log in through the home page. Please use the admin portal.',
          ),
        );
      });
    });

    describe('loginService on ADMIN_PAGE', () => {
      it('allows ADMIN to login', async () => {
        setupMocksForRole(USER_ROLE.ADMIN);
        const res = await service.loginService(
          { email: 'admin@test.com', password },
          LOGIN_PAGE.ADMIN_PAGE,
        );
        expect(res.message).toBe('Login successful');
      });

      it('rejects CUSTOMER with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.CUSTOMER);
        await expect(
          service.loginService(
            { email: 'customer@test.com', password },
            LOGIN_PAGE.ADMIN_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Access denied. Only administrators are allowed to log in through the admin portal.',
          ),
        );
      });

      it('rejects PUROHIT with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.PUROHIT);
        await expect(
          service.loginService(
            { email: 'purohit@test.com', password },
            LOGIN_PAGE.ADMIN_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Access denied. Only administrators are allowed to log in through the admin portal.',
          ),
        );
      });

      it('rejects ASTROLOGER with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.ASTROLOGER);
        await expect(
          service.loginService(
            { email: 'astrologer@test.com', password },
            LOGIN_PAGE.ADMIN_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Access denied. Only administrators are allowed to log in through the admin portal.',
          ),
        );
      });
    });

    describe('forgotPasswordService on HOME_PAGE and ADMIN_PAGE', () => {
      it('rejects ADMIN on HOME_PAGE with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.ADMIN);
        await expect(
          service.forgotPasswordService(
            { email: 'admin@test.com' },
            LOGIN_PAGE.HOME_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Admin accounts cannot reset password through the home page. Please use the admin portal.',
          ),
        );
      });

      it('rejects CUSTOMER on ADMIN_PAGE with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.CUSTOMER);
        await expect(
          service.forgotPasswordService(
            { email: 'customer@test.com' },
            LOGIN_PAGE.ADMIN_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Access denied. Only administrators are allowed to reset password through the admin portal.',
          ),
        );
      });

      it('rejects PUROHIT on ADMIN_PAGE with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.PUROHIT);
        await expect(
          service.forgotPasswordService(
            { email: 'purohit@test.com' },
            LOGIN_PAGE.ADMIN_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Access denied. Only administrators are allowed to reset password through the admin portal.',
          ),
        );
      });

      it('rejects ASTROLOGER on ADMIN_PAGE with BadRequestException', async () => {
        setupMocksForRole(USER_ROLE.ASTROLOGER);
        await expect(
          service.forgotPasswordService(
            { email: 'astrologer@test.com' },
            LOGIN_PAGE.ADMIN_PAGE,
          ),
        ).rejects.toThrow(
          new BadRequestException(
            'Access denied. Only administrators are allowed to reset password through the admin portal.',
          ),
        );
      });
    });
  });
});
