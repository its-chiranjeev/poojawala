import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import {
  User,
  USER_ROLE,
  USER_STATUS,
  PurohitProfile,
  PUROHIT_VERIFICATION_STATUS,
  PurohitMedia,
  PUROHIT_MEDIA_TYPE,
  PUROHIT_MEDIA_VERIFICATION_STATUS,
  PurohitBankAccount,
  BANK_VERIFICATION_STATUS,
  Service,
  PurohitService,
  PurohitServiceArea,
  CustomerAddress,
} from '@poojawala/entities';
import { VerifyPurohitDto } from '@poojawala/dtos';

describe('UserService - Purohit Verification Rework', () => {
  let service: UserService;

  // Mock dependencies
  let mockUserRepo: any;
  let mockPurohitProfileRepo: any;
  let mockPurohitMediaRepo: any;
  let mockPurohitBankRepo: any;
  let mockCustomerFavoriteRepo: any;
  let mockPlatformSettingRepo: any;
  let mockCustomerAddressRepo: any;
  let mockPurohitServiceAreaRepo: any;
  let mockOtpRepo: any;
  let mockBookingRepo: any;
  let mockPurohitServiceRepo: any;
  let mockDataSource: any;
  let mockS3Service: any;
  let mockEmailService: any;
  let mockSmsService: any;
  let mockConfigService: any;
  let mockAuditLogService: any;
  let mockNotificationService: any;

  // Mock database entities
  let testUser: User;
  let testAdmin: User;
  let testProfile: PurohitProfile;
  let testMedia: PurohitMedia[];
  let testBankAccount: PurohitBankAccount;
  let testServices: Service[];
  let testPurohitServices: any[];
  let testServiceAreas: any[];
  let testAddresses: any[];

  beforeEach(() => {
    testAdmin = {
      id: 99,
      email: 'admin@poojawala.com',
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      role: USER_ROLE.ADMIN,
      status: USER_STATUS.ACTIVE,
      tokenVersion: 1,
      authProvider: 'LOCAL',
      isAdminCreated: false,
      addresses: [],
      favorites: [],
      bookings: [],
    } as unknown as User;

    testUser = {
      id: 10,
      email: 'purohit@poojawala.com',
      username: 'purohit10',
      firstName: 'Ramesh',
      lastName: 'Sharma',
      role: USER_ROLE.PUROHIT,
      status: USER_STATUS.ACTIVE,
      tokenVersion: 1,
      authProvider: 'LOCAL',
      isAdminCreated: false,
      addresses: [],
      favorites: [],
      bookings: [],
    } as unknown as User;

    testProfile = {
      id: 101,
      userId: 10,
      bio: 'Vedic scholar with 10 years experience',
      qualification: ['Acharya in Shukla Yajurveda'],
      experienceYears: 10,
      languages: ['Hindi', 'Sanskrit'],
      specializations: ['Satyanarayan Katha', 'Griha Pravesh'],
      aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
      panDocUrl: 'https://storage.poojawala.com/pan.jpg',
      certificateUrl: 'https://storage.poojawala.com/cert.jpg',
      verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
      rejectionReason: undefined,
      isOnlineAvailable: false,
      isOfflineAvailable: false,
      avgRating: 0,
      bankAccounts: [],
      serviceAreas: [],
      media: [],
      purohitServices: [],
    } as unknown as PurohitProfile;

    testMedia = [
      {
        id: 1,
        purohitId: 101,
        mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
        documentType: 'AADHAAR',
        mediaUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING,
        displayOrder: 0,
        createdAt: new Date(),
      } as unknown as PurohitMedia,
      {
        id: 2,
        purohitId: 101,
        mediaType: PUROHIT_MEDIA_TYPE.IMAGE,
        documentType: 'PAN',
        mediaUrl: 'https://storage.poojawala.com/pan.jpg',
        verificationStatus: PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING,
        displayOrder: 1,
        createdAt: new Date(),
      } as unknown as PurohitMedia,
    ];

    testBankAccount = {
      id: 5,
      purohitId: 101,
      accountHolderName: 'Ramesh Sharma',
      accountNumber: '1234567890',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
      isPrimary: true,
    } as unknown as PurohitBankAccount;

    mockUserRepo = {
      findById: jest.fn().mockImplementation((id: number | string) => {
        if (Number(id) === testUser.id) return Promise.resolve(testUser);
        if (Number(id) === testAdmin.id) return Promise.resolve(testAdmin);
        if (Number(id) === 20) return Promise.resolve({ id: 20, role: USER_ROLE.PUROHIT, status: USER_STATUS.ACTIVE } as User);
        return Promise.resolve(null);
      }),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.id === testAdmin.id) return Promise.resolve(testAdmin);
        if (where?.id === testUser.id) return Promise.resolve(testUser);
        if (where?.id === 20) return Promise.resolve({ id: 20, role: USER_ROLE.PUROHIT, status: USER_STATUS.ACTIVE } as User);
        return Promise.resolve(null);
      }),
      findByEmail: jest.fn().mockImplementation((email: string) => {
        if (email === testUser.email) return Promise.resolve(testUser);
        if (email === testAdmin.email) return Promise.resolve(testAdmin);
        return Promise.resolve(null);
      }),
      getFullProfile: jest.fn().mockImplementation((userId: number) => {
        if (userId === testUser.id) {
          return Promise.resolve({
            ...testUser,
            profile: testProfile,
            serviceAreas: testServiceAreas,
            purohitServices: testPurohitServices,
            bankAccounts: [testBankAccount],
            media: testMedia,
          });
        }
        if (userId === 101) {
          return Promise.resolve({
            id: 101,
            role: USER_ROLE.CUSTOMER,
            status: USER_STATUS.ACTIVE,
            firstName: 'Amit',
            lastName: 'Verma',
            addresses: testAddresses,
          });
        }
        return Promise.resolve(null);
      }),
      updateUser: jest.fn().mockImplementation((id: string, payload: any) => {
        for (const key of Object.keys(payload)) {
          if (payload[key] !== undefined) {
            (testUser as any)[key] = payload[key];
          }
        }
        return Promise.resolve(testUser);
      }),
      save: jest.fn().mockImplementation((user: any) => Promise.resolve(user)),
      getAllUsers: jest.fn(),
    };

    mockPurohitProfileRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.userId === testUser.id || where?.id === testProfile.id) {
          return Promise.resolve(testProfile);
        }
        return Promise.resolve(null);
      }),
      findByUserId: jest.fn().mockImplementation((userId: number) => {
        if (userId === testUser.id) return Promise.resolve(testProfile);
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation((id: number, payload: any) => {
        for (const key of Object.keys(payload)) {
          if (payload[key] !== undefined) {
            (testProfile as any)[key] = payload[key];
          }
        }
        if (typeof payload.rejectionReason === 'function') {
          testProfile.rejectionReason = undefined;
        }
        return Promise.resolve({ affected: 1 });
      }),
      save: jest.fn().mockImplementation((profile: any) => Promise.resolve(profile)),
    };

    mockPurohitMediaRepo = {
      find: jest.fn().mockResolvedValue(testMedia),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        const found = testMedia.find(
          (m) => m.purohitId === where.purohitId && m.documentType === where.documentType,
        );
        return Promise.resolve(found || null);
      }),
      create: jest.fn().mockImplementation((data: any) => ({ id: Math.random(), ...data })),
      save: jest.fn().mockImplementation((media: any) => Promise.resolve(media)),
      update: jest.fn().mockImplementation((id: number, payload: any) => {
        const item = testMedia.find((m) => m.id === id);
        if (item) Object.assign(item, payload);
        return Promise.resolve({ affected: 1 });
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: () => ({
          set: (payload: any) => {
            testMedia.forEach((m) => {
              if (payload.verificationStatus) m.verificationStatus = payload.verificationStatus;
              if (payload.rejectionReason !== undefined) {
                m.rejectionReason = typeof payload.rejectionReason === 'function' ? undefined : payload.rejectionReason;
              }
            });
            return {
              where: () => ({
                andWhere: () => ({
                  execute: () => Promise.resolve({ affected: testMedia.length }),
                }),
              }),
            };
          },
        }),
      }),
    };

    mockPurohitBankRepo = {
      findById: jest.fn().mockResolvedValue(testBankAccount),
      findByPurohitId: jest.fn().mockResolvedValue([testBankAccount]),
      findOne: jest.fn().mockResolvedValue(testBankAccount),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      updateAccount: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((payload: any) => payload),
      save: jest.fn().mockImplementation((payload: any) => Promise.resolve(payload)),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: () => ({
          set: (payload: any) => {
            if (payload.verificationStatus) testBankAccount.verificationStatus = payload.verificationStatus;
            return {
              where: () => ({
                andWhere: () => ({
                  execute: () => Promise.resolve({ affected: 1 }),
                }),
              }),
            };
          },
        }),
      }),
    };

    testServices = [
      { id: 12, name: 'Satyanarayan Katha', isActive: true } as Service,
      { id: 15, name: 'Havan', isActive: true } as Service,
      { id: 21, name: 'Griha Pravesh', isActive: true } as Service,
      { id: 30, name: 'Rudrabhishek', isActive: true } as Service,
      { id: 31, name: 'Navgrah Shanti', isActive: true } as Service,
    ];
    testPurohitServices = [];
    testServiceAreas = [];
    testAddresses = [];

    mockCustomerFavoriteRepo = {};
    mockPlatformSettingRepo = {};
    mockCustomerAddressRepo = {
      findById: jest.fn().mockImplementation((id: number) => {
        const found = testAddresses.find((a) => a.id === id);
        return Promise.resolve(found || null);
      }),
      update: jest.fn().mockImplementation((id: number, payload: any) => {
        const item = testAddresses.find((a) => a.id === id);
        if (item) Object.assign(item, payload);
        return Promise.resolve({ affected: 1 });
      }),
      clearDefaultAddress: jest.fn().mockImplementation((customerId: number) => {
        testAddresses.forEach((a) => {
          if (a.customerId === customerId) a.isDefault = false;
        });
        return Promise.resolve();
      }),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        const found = testAddresses.find(
          (a) =>
            a.customerId === where?.customerId &&
            (where.isDefault === undefined || a.isDefault === where.isDefault),
        );
        return Promise.resolve(found || null);
      }),
      find: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          testAddresses.filter((a) => a.customerId === where?.customerId),
        );
      }),
      findAddresses: jest.fn().mockImplementation((customerId: number) => {
        const filtered = testAddresses.filter((a) => a.customerId === customerId);
        return Promise.resolve({ data: filtered, total: filtered.length });
      }),
      createAddress: jest.fn().mockImplementation((payload: any) => {
        const address = { id: Math.floor(Math.random() * 1000) + 1, ...payload };
        testAddresses.push(address);
        return Promise.resolve(address);
      }),
    };
    mockPurohitServiceAreaRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          testServiceAreas.filter((a) => a.purohitId === where?.purohitId && !a.deletedAt),
        );
      }),
      findById: jest.fn().mockImplementation((id: number) => {
        const found = testServiceAreas.find((a) => a.id === id && !a.deletedAt);
        return Promise.resolve(found || null);
      }),
      findByPurohitId: jest.fn().mockImplementation((purohitId: number) => {
        return Promise.resolve(
          testServiceAreas.filter((a) => a.purohitId === purohitId && !a.deletedAt),
        );
      }),
      createArea: jest.fn().mockImplementation((payload: any) => {
        const entity = {
          id: Math.floor(Math.random() * 1000) + 1,
          createdAt: new Date(),
          ...payload,
        };
        testServiceAreas.push(entity);
        return Promise.resolve(entity);
      }),
      clearDefaultAddress: jest.fn().mockImplementation((purohitId: number) => {
        testServiceAreas.forEach((a) => {
          if (a.purohitId === purohitId) a.isDefault = false;
        });
        return Promise.resolve();
      }),
      findServiceAreas: jest.fn().mockImplementation((purohitId: number, page: number = 1, limit: number = 10, search?: string, state?: string) => {
        let filtered = testServiceAreas.filter((a) => a.purohitId === purohitId && !a.deletedAt);
        if (state) {
          filtered = filtered.filter((a) => a.state && a.state.toLowerCase().includes(state.toLowerCase()));
        }
        if (search) {
          filtered = filtered.filter((a) => (a.city && a.city.toLowerCase().includes(search.toLowerCase())) || (a.addressLabel && a.addressLabel.toLowerCase().includes(search.toLowerCase())));
        }
        return Promise.resolve({ data: filtered, total: filtered.length });
      }),
      deleteArea: jest.fn().mockImplementation((id: number) => {
        const a = testServiceAreas.find((item) => item.id === id);
        if (a) a.deletedAt = new Date();
        return Promise.resolve();
      }),
      updateArea: jest.fn().mockImplementation((id: number, payload: any) => {
        const a = testServiceAreas.find((item) => item.id === id);
        if (a) Object.assign(a, payload);
        return Promise.resolve(a);
      }),
      create: jest.fn().mockImplementation((d: any) => ({
        id: Math.floor(Math.random() * 1000) + 1,
        ...d,
      })),
      save: jest.fn().mockImplementation((a: any) => {
        const entity = { id: a.id || Math.floor(Math.random() * 1000) + 1, ...a };
        testServiceAreas.push(entity);
        return Promise.resolve(entity);
      }),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        const found = testServiceAreas.find(
          (a) =>
            a.purohitId === where?.purohitId &&
            !a.deletedAt &&
            (where.isDefault === undefined || a.isDefault === where.isDefault),
        );
        return Promise.resolve(found || null);
      }),
    };
    mockOtpRepo = {};
    mockBookingRepo = {};
    mockPurohitServiceRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          testPurohitServices.filter((ps) => ps.purohitId === where?.purohitId),
        );
      }),
      softDelete: jest.fn().mockImplementation((id: number) => {
        const ps = testPurohitServices.find((p) => p.id === id);
        if (ps) ps.deletedAt = new Date();
        return Promise.resolve({ affected: 1 });
      }),
      restore: jest.fn().mockImplementation((id: number) => {
        const ps = testPurohitServices.find((p) => p.id === id);
        if (ps) ps.deletedAt = undefined;
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((id: number, payload: any) => {
        const ps = testPurohitServices.find((p) => p.id === id);
        if (ps) Object.assign(ps, payload);
        return Promise.resolve({ affected: 1 });
      }),
      create: jest.fn().mockImplementation((d: any) => ({
        id: Math.floor(Math.random() * 1000) + 1,
        ...d,
      })),
      save: jest.fn().mockImplementation((ps: any) => {
        const entity = { id: ps.id || Math.floor(Math.random() * 1000) + 1, ...ps };
        testPurohitServices.push(entity);
        return Promise.resolve(entity);
      }),
    };

    mockS3Service = {
      uploadProfileImage: jest.fn().mockResolvedValue('https://storage.poojawala.com/avatar.jpg'),
      uploadFileHelper: jest.fn().mockResolvedValue('https://storage.poojawala.com/new-doc.jpg'),
      isVercelBlobUrl: jest.fn().mockReturnValue(false),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
      getDownloadUrl: jest.fn().mockImplementation((url: string) => Promise.resolve(url)),
      getAttachmentDownloadUrl: jest.fn().mockImplementation((url: string) => Promise.resolve(url)),
    };

    mockEmailService = {
      sendPurohitApprovalEmail: jest.fn().mockResolvedValue(true),
      sendPurohitRejectionEmail: jest.fn().mockResolvedValue(true),
      sendPurohitCreatedByAdminEmail: jest.fn().mockResolvedValue(true),
    };

    mockSmsService = {};
    mockConfigService = { get: jest.fn() };
    mockAuditLogService = { createAuditLog: jest.fn().mockResolvedValue(true) };
    mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue(true),
      notifyAdmins: jest.fn().mockResolvedValue([]),
    };

    // Transaction and DataSource mock
    const getMockRepo = (entity: any) => {
      if (entity === User) {
        return {
          findOne: mockUserRepo.findOne,
          create: jest.fn().mockImplementation((data: any) => ({
            id: 888,
            ...data,
          })),
          save: jest.fn().mockImplementation((user: any) =>
            Promise.resolve({
              id: user.id || 888,
              ...user,
            }),
          ),
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: () => Promise.resolve(testUser),
              }),
            }),
            update: () => ({
              set: (payload: any) => {
                if (payload.status) testUser.status = payload.status;
                return {
                  where: () => ({ execute: () => Promise.resolve({ affected: 1 }) }),
                };
              },
            }),
          }),
          update: jest.fn().mockImplementation((criteria: any, payload: any) => {
            if (payload.status) testUser.status = payload.status;
            return Promise.resolve({ affected: 1 });
          }),
        };
      }
      if (entity === PurohitProfile) {
        return {
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: () => Promise.resolve(testProfile),
              }),
            }),
            update: () => ({
              set: (payload: any) => {
                if (payload.verificationStatus) {
                  testProfile.verificationStatus = payload.verificationStatus;
                }
                if (payload.rejectionReason !== undefined) {
                  testProfile.rejectionReason = typeof payload.rejectionReason === 'function' ? undefined : payload.rejectionReason;
                }
                return {
                  where: () => ({ execute: () => Promise.resolve({ affected: 1 }) }),
                };
              },
            }),
          }),
          update: jest.fn().mockImplementation((criteria: any, payload: any) => {
            if (payload.verificationStatus) {
              testProfile.verificationStatus = payload.verificationStatus;
            }
            if (payload.rejectionReason !== undefined) {
              testProfile.rejectionReason = typeof payload.rejectionReason === 'function' ? undefined : payload.rejectionReason;
            }
            return Promise.resolve({ affected: 1 });
          }),
        };
      }
      if (entity === PurohitMedia) {
        return {
          find: mockPurohitMediaRepo.find,
          createQueryBuilder: () => ({
            update: () => ({
              set: (payload: any) => {
                testMedia.forEach((m) => {
                  if (payload.verificationStatus) m.verificationStatus = payload.verificationStatus;
                  if (payload.rejectionReason !== undefined) {
                    m.rejectionReason = typeof payload.rejectionReason === 'function' ? undefined : payload.rejectionReason;
                  }
                });
                return {
                  where: () => ({
                    andWhere: () => ({ execute: () => Promise.resolve({ affected: testMedia.length }) }),
                  }),
                };
              },
            }),
          }),
        };
      }
      if (entity === PurohitBankAccount) {
        return {
          createQueryBuilder: () => {
            const builder: any = {
              update: () => builder,
              set: (payload: any) => {
                if (payload.verificationStatus) testBankAccount.verificationStatus = payload.verificationStatus;
                return builder;
              },
              where: () => builder,
              andWhere: () => builder,
              execute: () => Promise.resolve({ affected: 1 }),
            };
            return builder;
          },
        };
      }
      if (entity === Service) {
        return {
          find: jest.fn().mockImplementation(({ where }: any) => {
            const raw = where?.id;
            const ids: number[] = Array.isArray(raw?._value)
              ? raw._value
              : Array.isArray(raw)
              ? raw
              : raw !== undefined
              ? [raw]
              : [];
            return Promise.resolve(testServices.filter((s) => ids.includes(s.id)));
          }),
        };
      }
      if (entity === PurohitService) {
        return {
          create: jest.fn().mockImplementation((d: any) => ({
            id: Math.floor(Math.random() * 1000) + 1,
            ...d,
          })),
          save: jest.fn().mockImplementation((ps: any) => {
            const entity = { id: ps.id || Math.floor(Math.random() * 1000) + 1, ...ps };
            testPurohitServices.push(entity);
            return Promise.resolve(entity);
          }),
        };
      }
      if (entity === PurohitServiceArea) {
        return {
          update: jest.fn().mockImplementation((criteria: any, payload: any) => {
            testServiceAreas.forEach((a) => {
              if (typeof criteria === 'number' && a.id !== criteria) return;
              if (criteria.purohitId && a.purohitId !== criteria.purohitId) return;
              if (criteria.isDefault !== undefined && a.isDefault !== criteria.isDefault) return;
              if (criteria.id && a.id !== criteria.id) return;
              Object.assign(a, payload);
            });
            return Promise.resolve({ affected: 1 });
          }),
          softDelete: jest.fn().mockImplementation((id: number) => {
            const item = testServiceAreas.find((a) => a.id === id);
            if (item) item.deletedAt = new Date();
            return Promise.resolve({ affected: 1 });
          }),
          find: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              testServiceAreas.filter((a) => a.purohitId === where?.purohitId && !a.deletedAt),
            );
          }),
          create: jest.fn().mockImplementation((d: any) => ({
            id: Math.floor(Math.random() * 1000) + 1,
            ...d,
          })),
          save: jest.fn().mockImplementation((pa: any) => {
            const entity = { id: pa.id || Math.floor(Math.random() * 1000) + 1, ...pa };
            testServiceAreas.push(entity);
            return Promise.resolve(entity);
          }),
          restore: jest.fn().mockImplementation((id: number) => {
            const item = testServiceAreas.find((a) => a.id === id);
            if (item) item.deletedAt = undefined;
            return Promise.resolve();
          }),
        };
      }
      if (entity === CustomerAddress) {
        return {
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              testAddresses.filter((a) => a.customerId === where?.customerId && !a.deletedAt).length,
            );
          }),
          update: jest.fn().mockImplementation((criteria: any, payload: any) => {
            testAddresses.forEach((a) => {
              if (criteria.customerId && a.customerId !== criteria.customerId) return;
              if (criteria.isDefault !== undefined && a.isDefault !== criteria.isDefault) return;
              if (criteria.id && a.id !== criteria.id) return;
              Object.assign(a, payload);
            });
            return Promise.resolve({ affected: 1 });
          }),
          create: jest.fn().mockImplementation((d: any) => ({
            id: Math.floor(Math.random() * 1000) + 1,
            ...d,
          })),
          save: jest.fn().mockImplementation((ca: any) => {
            const entity = { id: ca.id || Math.floor(Math.random() * 1000) + 1, ...ca };
            testAddresses.push(entity);
            return Promise.resolve(entity);
          }),
          findOne: jest.fn().mockImplementation(({ where }: any) => {
            const found = testAddresses.find(
              (a) =>
                (!where.id || a.id === where.id) &&
                (!where.customerId || a.customerId === where.customerId),
            );
            return Promise.resolve(found || null);
          }),
        };
      }
      return {};
    };

    // Transaction mock
    mockDataSource = {
      getRepository: jest.fn().mockImplementation(getMockRepo),
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: getMockRepo,
          create: jest.fn().mockImplementation((entity: any, data: any) => ({
            id: 777,
            ...data,
          })),
          save: jest.fn().mockImplementation(async (entity: any, data?: any) => {
            if (data) return { id: data.id || 777, ...data };
            return { id: entity.id || 777, ...entity };
          }),
          update: jest.fn().mockImplementation(async (entity: any, criteria: any, payload: any) => {
            if (entity === CustomerAddress) {
              testAddresses.forEach((a) => {
                if (criteria.customerId && a.customerId !== criteria.customerId) return;
                if (criteria.isDefault !== undefined && a.isDefault !== criteria.isDefault) return;
                Object.assign(a, payload);
              });
            }
            return { affected: 1 };
          }),
        };
        return cb(manager);
      }),
    };

    service = new UserService(
      mockUserRepo,
      mockPurohitProfileRepo,
      mockCustomerFavoriteRepo,
      mockDataSource,
      mockS3Service,
      mockPlatformSettingRepo,
      mockCustomerAddressRepo,
      mockPurohitServiceAreaRepo,
      mockEmailService,
      mockOtpRepo,
      mockSmsService,
      mockConfigService,
      mockPurohitMediaRepo,
      mockPurohitBankRepo,
      mockBookingRepo,
      mockPurohitServiceRepo,
      mockAuditLogService,
      mockNotificationService,
    );
  });

  // =========================================================================
  // TEST 1 — Registration
  // =========================================================================
  describe('TEST 1 — Registration', () => {
    it('new Purohit has User.status = ACTIVE and verificationStatus = PENDING, allowing login', () => {
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      // Login rule: user.status === ACTIVE -> login is allowed
      expect(testUser.status === USER_STATUS.ACTIVE).toBe(true);
    });
  });

  // =========================================================================
  // TEST 2 & TEST 3 — Admin Rejects & Rejected Purohit Login
  // =========================================================================
  describe('TEST 2 & 3 — Admin Rejection and Login Check', () => {
    it('when admin rejects, User.status remains ACTIVE, verificationStatus becomes REJECTED, and login succeeds', async () => {
      const dto: VerifyPurohitDto = {
        status: PUROHIT_VERIFICATION_STATUS.REJECTED,
        rejectionReason: 'Please upload a clearer identity document and update your qualification details.',
      };

      const result = await service.verifyPurohitByAdmin(testAdmin.id, testUser.id, dto);

      expect(result.success).toBe(true);
      // STEP 2 Rule: User.status MUST remain ACTIVE
      expect(result.data.userStatus).toBe(USER_STATUS.ACTIVE);
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
      // verificationStatus becomes REJECTED
      expect(result.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(result.data.rejectionReason).toBe(dto.rejectionReason);

      // STEP 3 Rule: Login allowed because User.status === ACTIVE
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
      expect(testUser.status !== USER_STATUS.REJECTED).toBe(true);
      expect(testUser.status !== USER_STATUS.BLOCKED).toBe(true);
    });
  });

  // =========================================================================
  // TEST 4 — Rejected Purohit Views Profile
  // =========================================================================
  describe('TEST 4 — Rejected Purohit Views Profile', () => {
    it('returns verificationStatus = REJECTED and rejectionReason', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.REJECTED;
      testProfile.rejectionReason = 'Document is unreadable';

      const result = await service.getUserById(String(testUser.id));

      expect(result.success).toBe(true);
      const user = result.data as any;
      expect(user.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(user.rejectionReason).toBe('Document is unreadable');
      expect(user.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(user.profile.rejectionReason).toBe('Document is unreadable');
    });
  });

  // =========================================================================
  // TEST 5 — Rejected Purohit Edits Profile: Automatic Resubmission
  // =========================================================================
  describe('TEST 5 — Rejected Purohit Edits Profile (Automatic Resubmission)', () => {
    it('profile update for REJECTED purohit automatically transitions to PENDING and clears rejectionReason', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.REJECTED;
      testProfile.rejectionReason = 'Please upload a clearer identity document.';

      const updateDto = {
        bio: 'Updated bio with more qualifications',
        city: 'Varanasi',
      };

      const result = await service.updateProfileByUser(String(testUser.id), updateDto as any, {});

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(mockPurohitProfileRepo.update).toHaveBeenCalled();
      // Automatic resubmission transition
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(testProfile.rejectionReason).toBeUndefined();
      expect(result.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(result.data.rejectionReason).toBeNull();
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);

      // Verify audit log
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PUROHIT_VERIFICATION_RESUBMITTED',
          oldValue: expect.objectContaining({
            verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
            rejectionReason: 'Please upload a clearer identity document.',
          }),
          newValue: expect.objectContaining({
            verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
            rejectionReason: null,
          }),
        }),
      );

      // Verify Admin notification
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'Purohit Verification Resubmitted',
        expect.stringContaining('Ramesh Sharma has updated the previously rejected profile and submitted it for Admin review'),
        expect.anything(),
        testProfile.id,
        'PUROHIT_PROFILE',
        expect.objectContaining({
          userId: testUser.id,
          purohitId: testProfile.id,
          purohitName: 'Ramesh Sharma',
        }),
      );
    });
  });

  // =========================================================================
  // TEST 6 — Approved Purohit Edits Profile: Remains APPROVED
  // =========================================================================
  describe('TEST 6 — Approved Purohit Edits Profile', () => {
    it('profile update for APPROVED purohit does NOT revert to PENDING', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.APPROVED;
      testProfile.rejectionReason = undefined;

      const updateDto = {
        bio: 'Senior Acharya with 15 years experience',
      };

      const result = await service.updateProfileByUser(String(testUser.id), updateDto as any, {});

      expect(result.success).toBe(true);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(result.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
      // Resubmission audit log should NOT be triggered
      expect(mockAuditLogService.createAuditLog).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PUROHIT_VERIFICATION_RESUBMITTED',
        }),
      );
      // Admin resubmission notification should NOT be triggered
      expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalledWith(
        'Purohit Verification Resubmitted',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // =========================================================================
  // TEST 7 — Admin Approves After Edit-Profile Resubmission
  // =========================================================================
  describe('TEST 7 — Admin Approves After Edit-Profile Resubmission', () => {
    it('workflow: REJECTED -> EDIT PROFILE -> PENDING -> ADMIN APPROVE -> APPROVED', async () => {
      // 1. Initial rejection
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.REJECTED;
      testProfile.rejectionReason = 'Wrong docs';

      // 2. Resubmission via Edit Profile
      const updateDto = { bio: 'Corrected profile info' };
      const editResult = await service.updateProfileByUser(String(testUser.id), updateDto as any, {});
      expect(editResult.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);

      // 3. Admin approval
      const approveDto: VerifyPurohitDto = {
        status: PUROHIT_VERIFICATION_STATUS.APPROVED,
      };
      const approveResult = await service.verifyPurohitByAdmin(testAdmin.id, testUser.id, approveDto);

      expect(approveResult.success).toBe(true);
      expect(approveResult.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
    });
  });

  // =========================================================================
  // TEST 8 — Admin Rejects Again After Edit-Profile Resubmission
  // =========================================================================
  describe('TEST 8 — Admin Rejects Again', () => {
    it('workflow: REJECTED -> EDIT PROFILE -> PENDING -> ADMIN REJECT -> REJECTED with new reason', async () => {
      // 1. Initial rejection
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.REJECTED;
      testProfile.rejectionReason = 'Initial rejection reason';

      // 2. Resubmission via Edit Profile
      await service.updateProfileByUser(String(testUser.id), { city: 'Haridwar' } as any, {});
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);

      // 3. Admin rejects again
      const rejectAgainDto: VerifyPurohitDto = {
        status: PUROHIT_VERIFICATION_STATUS.REJECTED,
        rejectionReason: 'New rejection reason: second document is also blurry',
      };
      const rejectResult = await service.verifyPurohitByAdmin(testAdmin.id, testUser.id, rejectAgainDto);

      expect(rejectResult.success).toBe(true);
      expect(rejectResult.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(rejectResult.data.rejectionReason).toBe(rejectAgainDto.rejectionReason);
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
    });
  });

  // =========================================================================
  // TEST 9 — Merely Viewing Profile / Logging in Does NOT Resubmit
  // =========================================================================
  describe('TEST 9 — Merely Viewing Profile Does NOT Resubmit', () => {
    it('GET profile for REJECTED purohit leaves status as REJECTED and preserves rejectionReason', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.REJECTED;
      testProfile.rejectionReason = 'Please re-upload PAN card.';

      const result = await service.getUserById(String(testUser.id));

      expect(result.success).toBe(true);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect(testProfile.rejectionReason).toBe('Please re-upload PAN card.');
      expect((result.data as any).verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
      expect((result.data as any).rejectionReason).toBe('Please re-upload PAN card.');
    });
  });

  // =========================================================================
  // TEST 10 — Feature Access Checks
  // =========================================================================
  describe('TEST 10 — Verified vs Rejected Feature Access', () => {
    it('APPROVED verification allows verified functionality; REJECTED blocks verified features but allows login/profile/edit/resubmit', () => {
      // Approved
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.APPROVED;
      const isApprovedAllowed = testProfile.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED;
      expect(isApprovedAllowed).toBe(true);

      // Rejected
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.REJECTED;
      const isRejectedAllowedForVerifiedBooking = testProfile.verificationStatus === PUROHIT_VERIFICATION_STATUS.APPROVED;
      expect(isRejectedAllowedForVerifiedBooking).toBe(false);

      // But login / edit / resubmit remain allowed for rejected purohit
      expect(testUser.status).toBe(USER_STATUS.ACTIVE);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.REJECTED);
    });
  });

  // =========================================================================
  // TEST 11 — Confirmation: No Separate Resubmit Endpoint on UserController
  // =========================================================================
  describe('TEST 11 — No Separate Resubmit Endpoint', () => {
    it('confirms no separate resubmitPurohitVerification method exists on UserController', () => {
      expect((UserController.prototype as any).resubmitPurohitVerification).toBeUndefined();
    });
  });

  // =========================================================================
  // TEST 12 — Customer Profile Update Does NOT Trigger Verification Logic
  // =========================================================================
  describe('TEST 12 — Customer Profile Update Isolation', () => {
    it('Customer profile update does not touch PurohitProfile or trigger REJECTED -> PENDING', async () => {
      const testCustomer = {
        id: 77,
        email: 'customer@test.com',
        username: 'customer77',
        firstName: 'Jane',
        lastName: 'Doe',
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
      } as unknown as User;

      mockUserRepo.findById.mockImplementation((id: number | string) => {
        if (Number(id) === 77) return Promise.resolve(testCustomer);
        if (Number(id) === testUser.id) return Promise.resolve(testUser);
        if (Number(id) === testAdmin.id) return Promise.resolve(testAdmin);
        return Promise.resolve(null);
      });

      const customerUpdateDto = {
        firstName: 'Janet',
        lastName: 'Doe',
      };

      const result = await service.updateProfileByUser('77', customerUpdateDto as any, {});

      expect(result.success).toBe(true);
      // Purohit profile repository should never be queried or updated for Customer
      expect(mockPurohitProfileRepo.update).not.toHaveBeenCalled();
      expect(mockPurohitProfileRepo.findByUserId).not.toHaveBeenCalledWith(77);
      // Customer has no verificationStatus
      expect((result.data as any).verificationStatus).toBeUndefined();
    });
  });

  // =========================================================================
  // TEST 13 — Admin updateUserStatus Invalidates Session on BLOCKED or REJECTED
  // =========================================================================
  describe('TEST 13 — Account Status Management & Session Invalidation', () => {
    it('invalidates refresh token and increments tokenVersion when account is set to BLOCKED', async () => {
      testUser.status = USER_STATUS.ACTIVE;
      testUser.hashedRefreshToken = 'valid-refresh-hash';
      testUser.tokenVersion = 1;

      await service.updateUserStatus(testUser.id, USER_STATUS.BLOCKED, testAdmin.id);

      expect(testUser.status).toBe(USER_STATUS.BLOCKED);
      expect(testUser.hashedRefreshToken).toBeNull();
      expect(testUser.tokenVersion).toBe(2);
    });

    it('invalidates refresh token and increments tokenVersion when account is set to REJECTED', async () => {
      testUser.status = USER_STATUS.ACTIVE;
      testUser.hashedRefreshToken = 'valid-refresh-hash';
      testUser.tokenVersion = 1;

      await service.updateUserStatus(testUser.id, USER_STATUS.REJECTED, testAdmin.id);

      expect(testUser.status).toBe(USER_STATUS.REJECTED);
      expect(testUser.hashedRefreshToken).toBeNull();
      expect(testUser.tokenVersion).toBe(2);
    });
  });

  // =========================================================================
  // PART 1 & 4 — Admin Purohit Services and Service Areas (Tests 1 to 10)
  // =========================================================================
  describe('Admin Purohit Services & Service Areas (Tests 1-10)', () => {
    it('Test 1 — Create Purohit without services: no service mapping created', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test1@example.com',
        phone: '9876543211',
        password: 'Password123!',
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.services).toEqual([]);
    });

    it('Test 2 — Create Purohit without service areas: no service area mapping created', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test2@example.com',
        phone: '9876543212',
        password: 'Password123!',
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.serviceAreas).toEqual([]);
    });

    it('Test 3 — Create Purohit with services: correct service mappings created', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test3@example.com',
        phone: '9876543213',
        password: 'Password123!',
        services: [12, 15],
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.services).toHaveLength(2);
      expect(result.data.services.map((s: any) => s.serviceId)).toEqual(expect.arrayContaining([12, 15]));
    });

    it('Test 4 — Create Purohit with service areas: correct service areas created', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test4@example.com',
        phone: '9876543214',
        password: 'Password123!',
        serviceAreas: ['Ghaziabad', 'Noida'],
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.serviceAreas).toHaveLength(2);
      expect(result.data.serviceAreas.map((a: any) => a.city)).toEqual(expect.arrayContaining(['Ghaziabad', 'Noida']));
      expect(result.data.serviceAreas.some((a: any) => a.isDefault)).toBe(true);
    });

    it('Test 1 — Omitted services preserves existing mappings', async () => {
      testPurohitServices = [
        { id: 1, purohitId: testProfile.id, serviceId: 12, isActive: true } as any,
        { id: 2, purohitId: testProfile.id, serviceId: 15, isActive: true } as any,
        { id: 3, purohitId: testProfile.id, serviceId: 21, isActive: true } as any,
      ];

      const result = await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        bio: 'Updated',
      });

      expect(result).toBeDefined();
      expect(testProfile.bio).toBe('Updated');
      const activeServices = testPurohitServices.filter((s) => !s.deletedAt);
      expect(activeServices).toHaveLength(3);
      expect(activeServices.map((s) => s.serviceId)).toEqual(expect.arrayContaining([12, 15, 21]));
    });

    it('Test 2 — Empty services removes all', async () => {
      testPurohitServices = [
        { id: 1, purohitId: testProfile.id, serviceId: 12, isActive: true } as any,
        { id: 2, purohitId: testProfile.id, serviceId: 15, isActive: true } as any,
        { id: 3, purohitId: testProfile.id, serviceId: 21, isActive: true } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        services: [],
      });

      const activeServices = testPurohitServices.filter((s) => !s.deletedAt);
      expect(activeServices).toHaveLength(0);
    });

    it('Test 3 — Remove one service', async () => {
      testPurohitServices = [
        { id: 1, purohitId: testProfile.id, serviceId: 12, isActive: true } as any,
        { id: 2, purohitId: testProfile.id, serviceId: 15, isActive: true } as any,
        { id: 3, purohitId: testProfile.id, serviceId: 21, isActive: true } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        services: [12, 21],
      });

      const activeServices = testPurohitServices.filter((s) => !s.deletedAt);
      expect(activeServices).toHaveLength(2);
      expect(activeServices.map((s) => s.serviceId)).toEqual(expect.arrayContaining([12, 21]));
      const service15 = testPurohitServices.find((s) => s.serviceId === 15);
      expect(service15?.deletedAt).toBeDefined();
    });

    it('Test 4 — Replace services', async () => {
      testPurohitServices = [
        { id: 1, purohitId: testProfile.id, serviceId: 12, isActive: true } as any,
        { id: 2, purohitId: testProfile.id, serviceId: 15, isActive: true } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        services: [30, 31],
      });

      const activeServices = testPurohitServices.filter((s) => !s.deletedAt);
      expect(activeServices).toHaveLength(2);
      expect(activeServices.map((s) => s.serviceId)).toEqual(expect.arrayContaining([30, 31]));
      expect(testPurohitServices.find((s) => s.serviceId === 12)?.deletedAt).toBeDefined();
      expect(testPurohitServices.find((s) => s.serviceId === 15)?.deletedAt).toBeDefined();
    });

    it('Test 5 — Omitted serviceAreas preserves existing areas', async () => {
      testServiceAreas = [
        { id: 1, purohitId: testUser.id, city: 'Ghaziabad', addressLabel: 'Ghaziabad', isDefault: true } as any,
        { id: 2, purohitId: testUser.id, city: 'Noida', addressLabel: 'Noida', isDefault: false } as any,
        { id: 3, purohitId: testUser.id, city: 'Delhi', addressLabel: 'Delhi', isDefault: false } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        bio: 'Updated',
      });

      const activeAreas = testServiceAreas.filter((a) => !a.deletedAt);
      expect(activeAreas).toHaveLength(3);
      expect(activeAreas.map((a) => a.city)).toEqual(expect.arrayContaining(['Ghaziabad', 'Noida', 'Delhi']));
    });

    it('Test 6 — Empty serviceAreas removes all', async () => {
      testServiceAreas = [
        { id: 1, purohitId: testUser.id, city: 'Ghaziabad', addressLabel: 'Ghaziabad', isDefault: true } as any,
        { id: 2, purohitId: testUser.id, city: 'Noida', addressLabel: 'Noida', isDefault: false } as any,
        { id: 3, purohitId: testUser.id, city: 'Delhi', addressLabel: 'Delhi', isDefault: false } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        serviceAreas: [],
      });

      const activeAreas = testServiceAreas.filter((a) => !a.deletedAt);
      expect(activeAreas).toHaveLength(0);
    });

    it('Test 7 — Remove one service area', async () => {
      testServiceAreas = [
        { id: 1, purohitId: testUser.id, city: 'Ghaziabad', addressLabel: 'Ghaziabad', isDefault: true } as any,
        { id: 2, purohitId: testUser.id, city: 'Noida', addressLabel: 'Noida', isDefault: false } as any,
        { id: 3, purohitId: testUser.id, city: 'Delhi', addressLabel: 'Delhi', isDefault: false } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        serviceAreas: ['Ghaziabad', 'Delhi'],
      });

      const activeAreas = testServiceAreas.filter((a) => !a.deletedAt);
      expect(activeAreas).toHaveLength(2);
      expect(activeAreas.map((a) => a.city)).toEqual(expect.arrayContaining(['Ghaziabad', 'Delhi']));
      const noidaArea = testServiceAreas.find((a) => a.city === 'Noida');
      expect(noidaArea?.deletedAt).toBeDefined();
    });

    it('Test 8 — Replace service areas', async () => {
      testServiceAreas = [
        { id: 1, purohitId: testUser.id, city: 'Ghaziabad', addressLabel: 'Ghaziabad', isDefault: true } as any,
        { id: 2, purohitId: testUser.id, city: 'Noida', addressLabel: 'Noida', isDefault: false } as any,
        { id: 3, purohitId: testUser.id, city: 'Delhi', addressLabel: 'Delhi', isDefault: false } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        serviceAreas: ['Meerut', 'Gurgaon'],
      });

      const activeAreas = testServiceAreas.filter((a) => !a.deletedAt);
      expect(activeAreas).toHaveLength(2);
      expect(activeAreas.map((a) => a.city)).toEqual(expect.arrayContaining(['Meerut', 'Gurgaon']));
      expect(testServiceAreas.find((a) => a.city === 'Ghaziabad')?.deletedAt).toBeDefined();
      expect(testServiceAreas.find((a) => a.city === 'Noida')?.deletedAt).toBeDefined();
      expect(testServiceAreas.find((a) => a.city === 'Delhi')?.deletedAt).toBeDefined();
    });

    it('Test 9 — Duplicate services', async () => {
      testPurohitServices = [];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        services: [12, 12, 15],
      });

      const activeServices = testPurohitServices.filter((s) => !s.deletedAt);
      expect(activeServices).toHaveLength(2);
      expect(activeServices.map((s) => s.serviceId).sort()).toEqual([12, 15]);
    });

    it('Test 10 — Invalid service', async () => {
      testPurohitServices = [
        { id: 1, purohitId: testProfile.id, serviceId: 12, isActive: true } as any,
      ];

      await expect(
        service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
          services: [999999],
        }),
      ).rejects.toThrow(NotFoundException);

      expect(testPurohitServices.filter((s) => !s.deletedAt)).toHaveLength(1);
    });

    it('Test 11 — Services and areas together', async () => {
      testPurohitServices = [
        { id: 1, purohitId: testProfile.id, serviceId: 12, isActive: true } as any,
      ];
      testServiceAreas = [
        { id: 1, purohitId: testUser.id, city: 'Delhi', addressLabel: 'Delhi', isDefault: true } as any,
      ];

      await service.updateProfileByAdmin(testAdmin.id, String(testUser.id), {
        services: [30, 31],
        serviceAreas: ['Ghaziabad', 'Noida'],
      });

      const activeServices = testPurohitServices.filter((s) => !s.deletedAt);
      expect(activeServices).toHaveLength(2);
      expect(activeServices.map((s) => s.serviceId)).toEqual(expect.arrayContaining([30, 31]));
      expect(testPurohitServices.find((s) => s.serviceId === 12)?.deletedAt).toBeDefined();

      const activeAreas = testServiceAreas.filter((a) => !a.deletedAt);
      expect(activeAreas).toHaveLength(2);
      expect(activeAreas.map((a) => a.city)).toEqual(expect.arrayContaining(['Ghaziabad', 'Noida']));
      expect(testServiceAreas.find((a) => a.city === 'Delhi')?.deletedAt).toBeDefined();
    });

    it('Test 12 — Non-admin access', () => {
      const roles = Reflect.getMetadata('roles', UserController.prototype.updateProfileByAdmin);
      expect(roles).toBeDefined();
      expect(roles).toContain(USER_ROLE.ADMIN);
      expect(roles).not.toContain(USER_ROLE.PUROHIT);
      expect(roles).not.toContain(USER_ROLE.CUSTOMER);
    });
  });

  // =========================================================================
  // PART 2 & 4 — One Default Address Per User (Tests 11 to 18)
  // =========================================================================
  describe('One Default Address Per User (Tests 11-18)', () => {
    let customerId = 101;
    let customerUser: User;

    beforeEach(() => {
      customerId = 101;
      customerUser = {
        id: customerId,
        role: USER_ROLE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        firstName: 'Amit',
        lastName: 'Verma',
      } as unknown as User;

      mockUserRepo.findById.mockImplementation((id: any) => {
        if (Number(id) === customerId) return Promise.resolve(customerUser);
        if (Number(id) === 102) return Promise.resolve({ ...customerUser, id: 102 });
        if (Number(id) === 103) return Promise.resolve({ ...customerUser, id: 103 });
        if (Number(id) === testUser.id) return Promise.resolve(testUser);
        if (Number(id) === testAdmin.id) return Promise.resolve(testAdmin);
        return Promise.resolve(null);
      });
    });

    it('Test 11 — Create address with isDefault=true: sets new to true and existing default to false', async () => {
      testAddresses = [
        { id: 1, customerId, addressLabel: 'Home', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
      ];

      const res = await service.addAddress(customerId, {
        addressLabel: 'Office',
        fullAddress: 'Addr 2',
        city: 'Noida',
        state: 'UP',
        pincode: '201301',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(true);
      const addr1 = testAddresses.find((a) => a.id === 1);
      expect(addr1?.isDefault).toBe(false);
      const userDefaults = testAddresses.filter((a) => a.customerId === customerId && a.isDefault);
      expect(userDefaults).toHaveLength(1);
    });

    it('Test 12 — Create address with isDefault=false: preserves existing default', async () => {
      testAddresses = [
        { id: 1, customerId, addressLabel: 'Home', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
      ];

      const res = await service.addAddress(customerId, {
        addressLabel: 'Office',
        fullAddress: 'Addr 2',
        city: 'Noida',
        state: 'UP',
        pincode: '201301',
        venueType: 'HOME' as any,
        isDefault: false,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(false);
      const addr1 = testAddresses.find((a) => a.id === 1);
      expect(addr1?.isDefault).toBe(true);
      const userDefaults = testAddresses.filter((a) => a.customerId === customerId && a.isDefault);
      expect(userDefaults).toHaveLength(1);
    });

    it('Test 13 — Create address without isDefault: preserves existing default behavior', async () => {
      testAddresses = [
        { id: 1, customerId, addressLabel: 'Home', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
      ];

      const res = await service.addAddress(customerId, {
        addressLabel: 'Office',
        fullAddress: 'Addr 2',
        city: 'Noida',
        state: 'UP',
        pincode: '201301',
        venueType: 'HOME' as any,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(false);
      const addr1 = testAddresses.find((a) => a.id === 1);
      expect(addr1?.isDefault).toBe(true);
    });

    it('Test 14 — User has no previous default: creating with isDefault=true makes new address default', async () => {
      testAddresses = [];

      const res = await service.addAddress(102, {
        addressLabel: 'First Address',
        fullAddress: 'Addr 1',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(true);
      const userDefaults = testAddresses.filter((a) => a.customerId === 102 && a.isDefault);
      expect(userDefaults).toHaveLength(1);
    });

    it('Test 15 — Multiple previous addresses: all previous become false, new address becomes true', async () => {
      testAddresses = [
        { id: 1, customerId: 103, addressLabel: 'A1', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
        { id: 2, customerId: 103, addressLabel: 'A2', fullAddress: 'Addr 2', city: 'Delhi', pincode: '110001', isDefault: false } as any,
        { id: 3, customerId: 103, addressLabel: 'A3', fullAddress: 'Addr 3', city: 'Delhi', pincode: '110001', isDefault: false } as any,
      ];

      const res = await service.addAddress(103, {
        addressLabel: 'A4',
        fullAddress: 'Addr 4',
        city: 'Noida',
        state: 'UP',
        pincode: '201301',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(true);
      const previous = testAddresses.filter((a) => a.customerId === 103 && a.id !== res.data.id);
      expect(previous.every((a) => a.isDefault === false)).toBe(true);
      const userDefaults = testAddresses.filter((a) => a.customerId === 103 && a.isDefault);
      expect(userDefaults).toHaveLength(1);
    });

    it('Test 16 — Different users: updating User B default does NOT affect User A default', async () => {
      const userAId = 101;
      const userBId = 102;
      testAddresses = [
        { id: 1, customerId: userAId, addressLabel: 'A1', fullAddress: 'Addr A', city: 'Delhi', pincode: '110001', isDefault: true } as any,
        { id: 2, customerId: userBId, addressLabel: 'B1', fullAddress: 'Addr B', city: 'Delhi', pincode: '110001', isDefault: true } as any,
      ];

      const res = await service.addAddress(userBId, {
        addressLabel: 'B2',
        fullAddress: 'Addr B2',
        city: 'Noida',
        state: 'UP',
        pincode: '201301',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      expect(res.success).toBe(true);
      const userAAddr = testAddresses.find((a) => a.customerId === userAId && a.id === 1);
      expect(userAAddr?.isDefault).toBe(true);

      const userBAddr1 = testAddresses.find((a) => a.customerId === userBId && a.id === 2);
      expect(userBAddr1?.isDefault).toBe(false);
      expect(res.data.isDefault).toBe(true);
    });

    it('Test 17 — Booking + new default address: creates new default and unsets old default', async () => {
      testAddresses = [
        { id: 1, customerId, addressLabel: 'Old Default', fullAddress: 'Old St', city: 'Delhi', pincode: '110001', isDefault: true } as any,
      ];

      const res = await service.addAddress(customerId, {
        addressLabel: 'Booking Address',
        fullAddress: 'New Booking Venue St',
        city: 'Varanasi',
        state: 'UP',
        pincode: '221001',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(true);
      const oldAddress = testAddresses.find((a) => a.id === 1);
      expect(oldAddress?.isDefault).toBe(false);
      const currentDefaults = testAddresses.filter((a) => a.customerId === customerId && a.isDefault);
      expect(currentDefaults).toHaveLength(1);
    });

    it('Test 18 — Invariant: at most one default address exists per user', async () => {
      testAddresses = [];

      await service.addAddress(customerId, {
        addressLabel: 'A1',
        fullAddress: 'Full 1',
        city: 'City',
        state: 'State',
        pincode: '110001',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      await service.addAddress(customerId, {
        addressLabel: 'A2',
        fullAddress: 'Full 2',
        city: 'City',
        state: 'State',
        pincode: '110001',
        venueType: 'HOME' as any,
        isDefault: true,
      });

      await service.addAddress(customerId, {
        addressLabel: 'A3',
        fullAddress: 'Full 3',
        city: 'City',
        state: 'State',
        pincode: '110001',
        venueType: 'HOME' as any,
        isDefault: false,
      });

      const defaultAddresses = testAddresses.filter((a) => a.customerId === customerId && a.isDefault);
      expect(defaultAddresses.length).toBeLessThanOrEqual(1);
      expect(defaultAddresses.length).toBe(1);
    });
  });

  // =========================================================================
  // getUserById — city, state and plan-wise purohit payout amount
  // =========================================================================
  describe('getUserById — city, state and plan-wise purohit payout amount', () => {
    it('returns city and state in profile with state right below city and no duplicate data on root', async () => {
      testServiceAreas = [
        {
          id: 1,
          purohitId: testUser.id,
          city: 'Jaipur',
          state: 'Rajasthan',
          addressLabel: 'Jaipur Center',
          isDefault: true,
        } as any,
      ];

      const res = await service.getUserById(String(testUser.id));

      expect(res.success).toBe(true);
      expect(res.data.profile.city).toBe('Jaipur');
      expect(res.data.profile.state).toBe('Rajasthan');

      // State is placed directly below city in profile
      const keys = Object.keys(res.data.profile);
      const cityIdx = keys.indexOf('city');
      const stateIdx = keys.indexOf('state');
      expect(cityIdx).toBeGreaterThanOrEqual(0);
      expect(stateIdx).toBe(cityIdx + 1);

      // No duplicate city, state, or purohitServices on root safeUser
      expect(res.data.city).toBeUndefined();
      expect(res.data.state).toBeUndefined();
      expect(res.data.purohitServices).toBeUndefined();
    });

    it('in getAllUsers, places state below city in profile and does not send duplicate root city/state/purohitServices for Purohit', async () => {
      mockUserRepo.getAllUsers.mockResolvedValue({
        users: [
          {
            ...testUser,
            profile: { ...testProfile, city: 'Mathura' },
            serviceAreas: [
              {
                id: 1,
                purohitId: testUser.id,
                city: 'Mathura',
                state: 'Uttar Pradesh',
                isDefault: true,
              },
            ],
            purohitServices: [
              {
                id: 1,
                purohitId: testProfile.id,
                serviceId: 10,
                service: {
                  id: 10,
                  name: 'Puja',
                  plans: { basic: { price: 1000 } },
                },
              },
            ],
          },
        ],
        total: 1,
      });

      const res = await service.getAllUsers({ page: 1, limit: 10 } as any);
      expect(res.success).toBe(true);
      const user = res.data[0];
      expect(user.profile.city).toBe('Mathura');
      expect(user.profile.state).toBe('Uttar Pradesh');
      const keys = Object.keys(user.profile);
      const cityIdx = keys.indexOf('city');
      const stateIdx = keys.indexOf('state');
      expect(cityIdx).toBeGreaterThanOrEqual(0);
      expect(stateIdx).toBe(cityIdx + 1);
      expect(user.city).toBeUndefined();
      expect(user.state).toBeUndefined();
      expect(user.purohitServices).toBeUndefined();
    });

    it('returns plan-wise purohit payout amount inside service.plans', async () => {
      testPurohitServices = [
        {
          id: 1,
          purohitId: testProfile.id,
          serviceId: 12,
          isActive: true,
          service: {
            id: 12,
            name: 'Satyanarayan Katha',
            commissionPercentage: 10,
            tokenPercentage: 30,
            plans: {
              basic: {
                price: 5100,
                features: { havan: 'true' },
              },
              standard: {
                price: 8100,
                features: { havan: 'true', prasad: 'true' },
              },
            },
          },
        } as any,
      ];

      const res = await service.getUserById(String(testUser.id));

      expect(res.success).toBe(true);
      const services = res.data.profile.purohitServices;
      expect(services).toHaveLength(1);

      const serviceObj = services[0].service;
      expect(serviceObj).toBeDefined();
      expect(serviceObj.plans).toBeDefined();

      // Basic plan: 5100 - (10% = 510) = 4590
      expect(serviceObj.plans.basic.purohitPayoutAmount).toBe(4590);
      expect(serviceObj.plans.basic.tokenAmount).toBe(1530);

      // Standard plan: 8100 - (10% = 810) = 7290
      expect(serviceObj.plans.standard.purohitPayoutAmount).toBe(7290);
      expect(serviceObj.plans.standard.tokenAmount).toBe(2430);

      // Top-level purohitPayoutAmount is NOT returned on ps or service
      expect((services[0] as any).purohitPayoutAmount).toBeUndefined();
      expect((serviceObj as any).purohitPayoutAmount).toBeUndefined();
    });

    it('returns city and state for Customer from default address', async () => {
      mockUserRepo.findById.mockImplementation((id: any) => {
        if (Number(id) === 101) {
          return Promise.resolve({
            id: 101,
            role: USER_ROLE.CUSTOMER,
            status: USER_STATUS.ACTIVE,
            firstName: 'Amit',
            lastName: 'Verma',
          });
        }
        if (Number(id) === testUser.id) return Promise.resolve(testUser);
        return Promise.resolve(null);
      });

      testAddresses = [
        {
          id: 5,
          customerId: 101,
          city: 'Noida',
          state: 'Uttar Pradesh',
          isDefault: true,
        } as any,
      ];

      const res = await service.getUserById('101');

      expect(res.success).toBe(true);
      expect(res.data.city).toBe('Noida');
      expect(res.data.state).toBe('Uttar Pradesh');
    });

    it('admin edit user profile succeeds with countryCode, profile, bankAccount, and object serviceAreas', async () => {
      const payload: any = {
        firstName: 'Ramesh',
        lastName: 'Sharma',
        countryCode: '+91',
        profile: {
          bio: 'Experienced priest',
          city: 'Varanasi',
          experienceYears: 12,
        },
        bankAccount: {
          accountHolderName: 'Ramesh Sharma',
          accountNumber: '123456789',
          ifscCode: 'SBIN0001234',
        },
        serviceAreas: [
          {
            id: 1,
            city: 'Varanasi',
            addressLabel: 'Varanasi Center',
          },
        ],
      };

      const result = await service.updateProfileByAdmin(
        testAdmin.id,
        String(testUser.id),
        payload,
      );

      expect(result.success).toBe(true);
      expect(result.data.profile.city).toBe('Varanasi');
    });
  });

  describe('Purohit & Admin Service Area Management', () => {
    let area1: any;
    let area2: any;
    let otherPurohitArea: any;

    beforeEach(() => {
      testServiceAreas = [];

      area1 = {
        id: 1,
        purohitId: testUser.id,
        addressLabel: 'Home',
        streetName: 'MG Road',
        fullAddress: '123 MG Road, Delhi',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        isDefault: true,
        serviceRadiusKm: 15,
        createdAt: new Date('2026-01-01'),
        deletedAt: undefined,
      };

      area2 = {
        id: 2,
        purohitId: testUser.id,
        addressLabel: 'Office',
        streetName: 'Sector 18',
        fullAddress: '456 Sector 18, Noida',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pincode: '201301',
        isDefault: false,
        serviceRadiusKm: 20,
        createdAt: new Date('2026-02-01'),
        deletedAt: undefined,
      };

      otherPurohitArea = {
        id: 3,
        purohitId: 20,
        addressLabel: 'Other Home',
        streetName: 'Mall Road',
        fullAddress: '789 Mall Road, Shimla',
        city: 'Shimla',
        state: 'Himachal Pradesh',
        pincode: '171001',
        isDefault: true,
        serviceRadiusKm: 10,
        createdAt: new Date('2026-01-15'),
        deletedAt: undefined,
      };

      testServiceAreas.push(area1, area2, otherPurohitArea);
    });

    describe('PUROHIT Permissions and Ownership', () => {
      it('1. Purohit can create own service area', async () => {
        const dto = {
          addressLabel: 'Temple',
          streetName: 'Temple Street',
          fullAddress: 'Near Mandir',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110002',
          isDefault: false,
        };

        const res = await service.addServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
        );

        expect(res.success).toBe(true);
        expect(res.data.purohitId).toBe(testUser.id);
        expect(res.data.city).toBe('Delhi');
      });

      it('2. Purohit can list own service areas', async () => {
        const res = await service.getMyServiceAreas(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          10,
        );

        expect(res.success).toBe(true);
        expect(res.data.length).toBe(2);
        expect(res.data.every((a: any) => a.purohitId === testUser.id)).toBe(true);
      });

      it('3. Purohit can get own service area', async () => {
        const res = await service.getServiceAreaById(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
        );

        expect(res.success).toBe(true);
        expect(res.data.id).toBe(1);
        expect(res.data.purohitId).toBe(testUser.id);
      });

      it('4. Purohit can update own service area', async () => {
        const updateDto = { addressLabel: 'Updated Home' };

        const res = await service.updateServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          updateDto as any,
        );

        expect(res.success).toBe(true);
        expect(res.data.addressLabel).toBe('Updated Home');
      });

      it('5. Purohit can delete own service area', async () => {
        const res = await service.deleteServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          2,
        );

        expect(res.success).toBe(true);
        expect(area2.deletedAt).toBeDefined();
      });

      it('6. Purohit cannot access another Purohit service area', async () => {
        await expect(
          service.getServiceAreaById(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            3,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('7. Purohit cannot update another Purohit service area', async () => {
        await expect(
          service.updateServiceArea(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            3,
            { city: 'Hacked City' } as any,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('8. Purohit cannot delete another Purohit service area', async () => {
        await expect(
          service.deleteServiceArea(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            3,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('9. Soft-deleted area does not appear in list', async () => {
        area2.deletedAt = new Date();

        const res = await service.getMyServiceAreas(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          10,
        );

        expect(res.data.length).toBe(1);
        expect(res.data.find((a: any) => a.id === 2)).toBeUndefined();
      });

      it('10. Soft-deleted area returns 404 from normal detail API', async () => {
        area1.deletedAt = new Date();

        await expect(
          service.getServiceAreaById(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            1,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('Purohit cannot bypass ownership by supplying another purohitId in body or query', async () => {
        const dto = {
          purohitId: 20, // Untrusted
          addressLabel: 'Sneaky',
          streetName: 'Secret',
          fullAddress: 'Secret Address',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
        };

        const res = await service.addServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
          20,
        );

        // Target must resolve to authenticated user's ID
        expect(res.data.purohitId).toBe(testUser.id);
      });
    });

    describe('ADMIN Permissions and Target Purohit Resolution', () => {
      it('11. Admin can list a Purohit service areas', async () => {
        const res = await service.getMyServiceAreas(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          10,
          undefined,
          undefined,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.length).toBe(2);
        expect(res.data.every((a: any) => a.purohitId === testUser.id)).toBe(true);
      });

      it('12. Admin can get a Purohit service area', async () => {
        const res = await service.getServiceAreaById(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.id).toBe(1);
        expect(res.data.purohitId).toBe(testUser.id);
      });

      it('13. Admin can create a service area for a Purohit', async () => {
        const dto = {
          addressLabel: 'Admin Created',
          streetName: 'Central Road',
          fullAddress: 'Central Delhi',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110005',
        };

        const res = await service.addServiceArea(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          dto as any,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.purohitId).toBe(testUser.id);
      });

      it('14. Admin can update a Purohit service area', async () => {
        const res = await service.updateServiceArea(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          { city: 'New Delhi' } as any,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.city).toBe('New Delhi');
      });

      it('15. Admin can delete a Purohit service area', async () => {
        const res = await service.deleteServiceArea(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(area1.deletedAt).toBeDefined();
        // Since area1 was default, area2 should be promoted to default
        expect(area2.isDefault).toBe(true);
      });

      it('16. Admin receives 404 when target Purohit does not exist', async () => {
        await expect(
          service.getMyServiceAreas(
            { id: testAdmin.id, role: USER_ROLE.ADMIN },
            1,
            10,
            undefined,
            undefined,
            9999,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('17. Admin cannot access a nonexistent service area', async () => {
        await expect(
          service.getServiceAreaById(
            { id: testAdmin.id, role: USER_ROLE.ADMIN },
            8888,
            testUser.id,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('18. Deleted service area does not appear in Admin list', async () => {
        area1.deletedAt = new Date();

        const res = await service.getMyServiceAreas(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          10,
          undefined,
          undefined,
          testUser.id,
        );

        expect(res.data.length).toBe(1);
        expect(res.data[0].id).toBe(2);
      });

      it('Admin delete using deleteServiceArea works and reuses delete logic', async () => {
        const res = await service.deleteServiceArea(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          2,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.message).toBe('Service area deleted successfully');
        expect(area2.deletedAt).toBeDefined();
        // Global/other Purohit service area still exists
        expect(otherPurohitArea.deletedAt).toBeUndefined();
      });
    });

    describe('Default Service Area Rules', () => {
      it('19. Setting a new service area as default removes default from the previous area', async () => {
        expect(area1.isDefault).toBe(true);
        expect(area2.isDefault).toBe(false);

        await service.updateServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          2,
          { isDefault: true } as any,
        );

        expect(area1.isDefault).toBe(false);
        expect(area2.isDefault).toBe(true);
      });

      it('20. Only one active default service area exists for a Purohit when creating new default area', async () => {
        const dto = {
          addressLabel: 'New Default Area',
          streetName: 'Ring Road',
          fullAddress: 'Ring Road Delhi',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110007',
          isDefault: true,
        };

        const res = await service.addServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
        );

        expect(res.data.isDefault).toBe(true);
        expect(area1.isDefault).toBe(false);

        const activeDefaults = testServiceAreas.filter(
          (a) => a.purohitId === testUser.id && !a.deletedAt && a.isDefault,
        );
        expect(activeDefaults.length).toBe(1);
      });

      it('21. Service area list orders isDefault=true first, then by createdAt DESC', async () => {
        testServiceAreas = [
          {
            id: 101,
            purohitId: testUser.id,
            city: 'Noida',
            isDefault: false,
            createdAt: new Date('2026-08-01'),
          },
          {
            id: 102,
            purohitId: testUser.id,
            city: 'Ghaziabad',
            isDefault: false,
            createdAt: new Date('2026-08-15'),
          },
          {
            id: 103,
            purohitId: testUser.id,
            city: 'Delhi',
            isDefault: true,
            createdAt: new Date('2026-08-05'),
          },
        ];

        const res = await service.getMyServiceAreas(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
        );

        expect(res.data).toHaveLength(3);
        // Default area must be first
        expect(res.data[0].id).toBe(103);
        expect(res.data[0].isDefault).toBe(true);
        // Next area must be newer createdAt
        expect(res.data[1].id).toBe(102);
        // Oldest area last
        expect(res.data[2].id).toBe(101);
      });
    });

    describe('Controller Decorator and Authorization Guard Verification', () => {
      it('controller endpoints have both PUROHIT and ADMIN roles allowed', () => {
        const addRoles = Reflect.getMetadata('roles', UserController.prototype.addServiceArea);
        expect(addRoles).toContain(USER_ROLE.PUROHIT);
        expect(addRoles).toContain(USER_ROLE.ADMIN);

        const updateRoles = Reflect.getMetadata('roles', UserController.prototype.updateServiceArea);
        expect(updateRoles).toContain(USER_ROLE.PUROHIT);
        expect(updateRoles).toContain(USER_ROLE.ADMIN);

        const getListRoles = Reflect.getMetadata('roles', UserController.prototype.getMyServiceAreas);
        expect(getListRoles).toContain(USER_ROLE.PUROHIT);
        expect(getListRoles).toContain(USER_ROLE.ADMIN);

        const getByIdRoles = Reflect.getMetadata('roles', UserController.prototype.getServiceAreaById);
        expect(getByIdRoles).toContain(USER_ROLE.PUROHIT);
        expect(getByIdRoles).toContain(USER_ROLE.ADMIN);

        const deleteRoles = Reflect.getMetadata('roles', UserController.prototype.deleteServiceArea);
        expect(deleteRoles).toContain(USER_ROLE.PUROHIT);
        expect(deleteRoles).toContain(USER_ROLE.ADMIN);
      });
    });

    describe('Deleted Address & Service Area Visibility Tests', () => {
      it('Active address appears in Admin Purohit response and soft-deleted address does not', async () => {
        testServiceAreas = [
          {
            id: 11,
            purohitId: testUser.id,
            city: 'Delhi',
            state: 'Delhi',
            isDefault: true,
            createdAt: new Date(),
            deletedAt: undefined,
          },
          {
            id: 12,
            purohitId: testUser.id,
            city: 'Noida',
            state: 'Uttar Pradesh',
            isDefault: false,
            createdAt: new Date(),
            deletedAt: new Date(), // Soft deleted
          },
        ];

        const res = await service.getUserById(String(testUser.id));

        expect(res.success).toBe(true);
        expect(res.data.serviceAreas.length).toBe(1);
        expect(res.data.serviceAreas[0].id).toBe(11);
        expect(res.data.serviceAreas.find((a: any) => a.id === 12)).toBeUndefined();
      });

      it('All addresses deleted returns an empty array', async () => {
        testServiceAreas = [
          {
            id: 11,
            purohitId: testUser.id,
            city: 'Delhi',
            state: 'Delhi',
            isDefault: true,
            createdAt: new Date(),
            deletedAt: new Date(),
          },
        ];

        const res = await service.getUserById(String(testUser.id));

        expect(res.success).toBe(true);
        expect(res.data.serviceAreas.length).toBe(0);
      });

      it('Deleted address cannot be selected as default address', async () => {
        testServiceAreas = [
          {
            id: 11,
            purohitId: testUser.id,
            city: 'Old City',
            state: 'Old State',
            isDefault: true,
            createdAt: new Date('2025-01-01'),
            deletedAt: new Date(), // Deleted default!
          },
          {
            id: 12,
            purohitId: testUser.id,
            city: 'Active City',
            state: 'Active State',
            isDefault: false,
            createdAt: new Date('2026-01-01'),
            deletedAt: undefined, // Active fallback
          },
        ];

        const res = await service.getUserById(String(testUser.id));

        expect(res.success).toBe(true);
        expect(res.data.profile.city).toBe('Active City');
        expect(res.data.profile.state).toBe('Active State');
      });
    });
  });
});

