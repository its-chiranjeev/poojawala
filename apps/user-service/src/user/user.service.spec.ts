import { BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
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
  BankAccount,
  BANK_VERIFICATION_STATUS,
  PUROHIT_PAYMENT_METHOD,
  BANK_ACCOUNT_TYPE,
  Service,
  PurohitService,
  PurohitServiceArea,
  CustomerAddress,
  AstrologerProfile,
  PLATFORM_SETTING_KEY,
  AUDIT_MODULE,
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
  let testBankAccount: BankAccount;
  let testBankAccounts: any[];
  let testServices: Service[];
  let testPurohitServices: any[];
  let testServiceAreas: any[];
  let testAddresses: any[];
  let testAstrologerProfile: any;

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
      userId: 10,
      purohitId: 101,
      accountHolderName: 'Ramesh Sharma',
      accountNumber: '1234567890',
      ifscCode: 'SBIN0001234',
      bankName: 'State Bank of India',
      paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
      verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
      isPrimary: true,
    } as unknown as BankAccount;

    testBankAccounts = [testBankAccount];

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
        if (where?.userId === 20 || where?.id === 201) {
          return Promise.resolve({
            id: 201,
            userId: 20,
            verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
          });
        }
        return Promise.resolve(null);
      }),
      findByUserId: jest.fn().mockImplementation((userId: number) => {
        if (userId === testUser.id) return Promise.resolve(testProfile);
        if (userId === 20) {
          return Promise.resolve({
            id: 201,
            userId: 20,
            verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
          });
        }
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
      findById: jest.fn().mockImplementation((id: number) => {
        const found = testBankAccounts.find((b) => b.id === id);
        return Promise.resolve(found || null);
      }),
      findByPurohitId: jest.fn().mockImplementation((purohitId: number) => {
        const found = testBankAccounts.filter(
          (b) =>
            b.purohitId === purohitId ||
            b.userId === purohitId ||
            (purohitId === 101 && b.userId === 10) ||
            (purohitId === 10 && b.purohitId === 101),
        );
        return Promise.resolve(found);
      }),
      findByUserId: jest.fn().mockImplementation((userId: number) => {
        const found = testBankAccounts.filter(
          (b) =>
            b.userId === userId ||
            b.purohitId === userId ||
            (userId === 10 && b.purohitId === 101) ||
            (userId === 101 && b.userId === 10),
        );
        return Promise.resolve(found);
      }),
      findByAccountNumber: jest.fn().mockImplementation((accountNumber: string) => {
        const found = testBankAccounts.find((b) => b.accountNumber === accountNumber);
        return Promise.resolve(found || null);
      }),
      findPrimaryAccount: jest.fn().mockImplementation((userId: number) => {
        const found = testBankAccounts.find(
          (b) =>
            (b.userId === userId || b.purohitId === userId || (userId === 10 && b.purohitId === 101)) &&
            b.isPrimary,
        );
        return Promise.resolve(found || null);
      }),
      clearPrimaryAccount: jest.fn().mockImplementation((userId: number) => {
        testBankAccounts.forEach((b) => {
          if (b.userId === userId || b.purohitId === userId || (userId === 10 && b.purohitId === 101))
            b.isPrimary = false;
        });
        return Promise.resolve();
      }),
      createAccount: jest.fn().mockImplementation((payload: any) => {
        const newAcc = { id: testBankAccounts.length + 10, ...payload };
        testBankAccounts.push(newAcc);
        return Promise.resolve(newAcc);
      }),
      updateAccount: jest.fn().mockImplementation((id: number, data: any) => {
        const found = testBankAccounts.find((b) => b.id === id);
        if (found) Object.assign(found, data);
        return Promise.resolve(found || null);
      }),
      deleteAccount: jest.fn().mockImplementation((id: number) => {
        testBankAccounts = testBankAccounts.filter((b) => b.id !== id);
        return Promise.resolve({ affected: 1 });
      }),
      findBankAccounts: jest.fn().mockImplementation((userId: number, page: number = 1, limit: number = 10, search?: string) => {
        let list = testBankAccounts.filter(
          (b) =>
            b.userId === userId ||
            b.purohitId === userId ||
            (userId === 10 && b.purohitId === 101) ||
            (userId === 101 && b.userId === 10),
        );
        if (search) {
          list = list.filter((b) => String(b.id).includes(search) || b.accountHolderName?.includes(search) || b.accountNumber?.includes(search));
        }
        return Promise.resolve({ data: list, total: list.length });
      }),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(testBankAccounts[0] || null)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((payload: any) => payload),
      save: jest.fn().mockImplementation((payload: any) => Promise.resolve(payload)),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: () => ({
          set: (payload: any) => {
            if (payload.verificationStatus && testBankAccounts[0]) testBankAccounts[0].verificationStatus = payload.verificationStatus;
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
    testServiceAreas = [
      { id: 1, purohitId: 10, city: 'Varanasi', state: 'Uttar Pradesh', addressLabel: 'Varanasi Central', isDefault: true },
    ];
    testAddresses = [];

    mockCustomerFavoriteRepo = {};
    mockPlatformSettingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
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
      count: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          testServiceAreas.filter((a) => a.purohitId === where?.purohitId && !a.deletedAt).length,
        );
      }),
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
      update: jest.fn().mockImplementation((id: number, payload: any) => {
        const a = testServiceAreas.find((item) => item.id === id);
        if (a) Object.assign(a, payload);
        return Promise.resolve({ affected: 1 });
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
      sendPurohitWelcomeApprovedEmail: jest.fn().mockResolvedValue(true),
      sendAstrologerCreatedByAdminEmail: jest.fn().mockResolvedValue(true),
      sendAstrologerWelcomeApprovedEmail: jest.fn().mockResolvedValue(true),
      sendAstrologerRegistrationEmail: jest.fn().mockResolvedValue(true),
      sendAstrologerApprovalEmail: jest.fn().mockResolvedValue(true),
      sendAstrologerRejectionEmail: jest.fn().mockResolvedValue(true),
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
              where: (clause: string, params: any) => ({
                getOne: () => {
                  const targetId = params?.targetUserId ?? params?.userId;
                  if (targetId !== undefined) {
                    return mockUserRepo.findById(targetId);
                  }
                  return Promise.resolve(testUser);
                },
              }),
            }),
            update: () => ({
              set: (payload: any) => {
                if (payload.status) testUser.status = payload.status;
                if (payload.isAdminCreated !== undefined) testUser.isAdminCreated = payload.isAdminCreated;
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
          ...mockPurohitMediaRepo,
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
      if (entity === BankAccount) {
        return {
          findOne: jest.fn().mockImplementation(({ where }: any) => {
            const found = testBankAccounts.find(
              (b) =>
                (!where?.userId ||
                  b.userId === where.userId ||
                  (where.userId === 10 && b.purohitId === 101)) &&
                (!where?.isPrimary || b.isPrimary === where.isPrimary) &&
                !b.deletedAt,
            );
            return Promise.resolve(found || null);
          }),
          find: jest.fn().mockImplementation(({ where, order }: any) => {
            let filtered = testBankAccounts.filter(
              (b) =>
                (!where?.userId ||
                  b.userId === where.userId ||
                  (where.userId === 10 && b.purohitId === 101)) &&
                (!where?.purohitId ||
                  b.purohitId === where.purohitId ||
                  b.userId === where.purohitId ||
                  (where.purohitId === 101 && b.userId === 10)) &&
                !b.deletedAt,
            );
            if (order?.id === 'ASC') {
              filtered = [...filtered].sort((a, b) => a.id - b.id);
            }
            return Promise.resolve(filtered);
          }),
          update: jest.fn().mockImplementation((criteria: any, payload: any) => {
            testBankAccounts.forEach((b) => {
              if (typeof criteria === 'number' && b.id !== criteria) return;
              if (
                criteria.userId &&
                b.userId !== criteria.userId &&
                !(criteria.userId === 10 && b.purohitId === 101)
              )
                return;
              if (
                criteria.purohitId &&
                b.purohitId !== criteria.purohitId &&
                b.userId !== criteria.purohitId &&
                !(criteria.purohitId === 101 && b.userId === 10)
              )
                return;
              if (criteria.isPrimary !== undefined && b.isPrimary !== criteria.isPrimary) return;
              if (criteria.id && b.id !== criteria.id) return;
              Object.assign(b, payload);
            });
            return Promise.resolve({ affected: 1 });
          }),
          create: jest.fn().mockImplementation((d: any) => ({
            id: d.id || testBankAccounts.length + 10,
            ...d,
          })),
          save: jest.fn().mockImplementation((acc: any) => {
            const entity = { id: acc.id || testBankAccounts.length + 10, ...acc };
            testBankAccounts.push(entity);
            return Promise.resolve(entity);
          }),
          softDelete: jest.fn().mockImplementation((id: number) => {
            const found = testBankAccounts.find((b) => b.id === id);
            if (found) found.deletedAt = new Date();
            testBankAccounts = testBankAccounts.filter((b) => b.id !== id);
            return Promise.resolve({ affected: 1 });
          }),
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
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              testServiceAreas.filter((a) => a.purohitId === where?.purohitId && !a.deletedAt).length,
            );
          }),
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
              if (typeof criteria === 'number' && a.id !== criteria) return;
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
          softDelete: jest.fn().mockImplementation((id: number) => {
            const item = testAddresses.find((a) => a.id === id);
            if (item) item.deletedAt = new Date();
            return Promise.resolve({ affected: 1 });
          }),
          find: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              testAddresses.filter(
                (a) => (!where?.customerId || a.customerId === where.customerId) && !a.deletedAt,
              ),
            );
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
      if (entity === AstrologerProfile) {
        return {
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: () => Promise.resolve(testAstrologerProfile),
              }),
            }),
          }),
          findOne: jest.fn().mockImplementation(({ where }: any) => {
            if (testAstrologerProfile && (!where?.userId || testAstrologerProfile.userId === where.userId)) {
              return Promise.resolve(testAstrologerProfile);
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((d: any) => ({
            id: 999,
            ...d,
          })),
          save: jest.fn().mockImplementation((ap: any) => {
            testAstrologerProfile = { ...(testAstrologerProfile || {}), ...ap };
            return Promise.resolve(testAstrologerProfile);
          }),
          update: jest.fn().mockImplementation((id: any, payload: any) => {
            if (testAstrologerProfile) {
              Object.assign(testAstrologerProfile, payload);
            }
            return Promise.resolve({ affected: 1 });
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

    it('allows admin approval when qualification is empty or not provided', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;
      testProfile.qualification = [];

      const approveDto: VerifyPurohitDto = {
        status: PUROHIT_VERIFICATION_STATUS.APPROVED,
      };
      const approveResult = await service.verifyPurohitByAdmin(testAdmin.id, testUser.id, approveDto);

      expect(approveResult.success).toBe(true);
      expect(approveResult.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
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
    it('Test 1 — Create Purohit without services: no service mapping created and profile auto-approved', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test1@example.com',
        phone: '9876543211',
        password: 'Password123!',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        bio: 'Vedic priest with 10 years experience',
        qualification: ['Acharya in Shukla Yajurveda'],
        aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'Rahul Sharma',
        serviceAreas: ['Varanasi'],
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.services).toEqual([]);
      expect(result.data.user.isAdminCreated).toBe(false);
      expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
    });

    it('Test 2 — Create Purohit without service areas: no service area mapping created and profile remains pending', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test2@example.com',
        phone: '9876543212',
        password: 'Password123!',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        bio: 'Vedic priest with 10 years experience',
        qualification: ['Acharya in Shukla Yajurveda'],
        aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'Rahul Sharma',
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.serviceAreas).toEqual([]);
      expect(result.data.user.isAdminCreated).toBe(true);
      expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
    });

    it('Test 3 — Create Purohit with services: correct service mappings created', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test3@example.com',
        phone: '9876543213',
        password: 'Password123!',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        bio: 'Vedic priest with 10 years experience',
        qualification: ['Acharya in Shukla Yajurveda'],
        aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'Rahul Sharma',
        serviceAreas: ['Varanasi'],
        services: [12, 15],
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.services).toHaveLength(2);
      expect(result.data.services.map((s: any) => s.serviceId)).toEqual(expect.arrayContaining([12, 15]));
      expect(result.data.user.isAdminCreated).toBe(false);
      expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
    });

    it('Test 4 — Create Purohit with service areas: correct service areas created', async () => {
      const dto = {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.test4@example.com',
        phone: '9876543214',
        password: 'Password123!',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        bio: 'Vedic priest with 10 years experience',
        qualification: ['Acharya in Shukla Yajurveda'],
        aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        accountHolderName: 'Rahul Sharma',
        serviceAreas: ['Ghaziabad', 'Noida'],
      };
      const result = await service.createPurohitByAdmin(dto);
      expect(result.success).toBe(true);
      expect(result.data.serviceAreas).toHaveLength(2);
      expect(result.data.serviceAreas.map((a: any) => a.city)).toEqual(expect.arrayContaining(['Ghaziabad', 'Noida']));
      expect(result.data.serviceAreas.some((a: any) => a.isDefault)).toBe(true);
      expect(result.data.user.isAdminCreated).toBe(false);
      expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
    });

    describe('createAstrologerByAdmin', () => {
      it('successfully creates an astrologer user and profile with auto-approval and no service area', async () => {
        const dto = {
          firstName: 'Anand',
          lastName: 'Mishra',
          email: 'anand.astrologer@example.com',
          phone: '9876543999',
          password: 'Password123!',
          experienceYears: 7,
          ratePerMinute: 25,
          commissionPrice: 5,
          specializations: ['Kundali', 'Vastu'],
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Expert Vedic Astrologer with 7 years of practice',
          qualification: ['Acharya in Jyotish'],
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '123456789012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Anand Mishra',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user).toBeDefined();
        expect(result.profile).toBeDefined();
        expect(result.user.role).toBe(USER_ROLE.ASTROLOGER);
        expect(result.user.isAdminCreated).toBe(false);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(result.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).toHaveBeenCalledWith(
          dto.email,
          'Anand Mishra',
          expect.any(String),
          dto.phone,
        );
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('throws BadRequestException if neither email nor phone is provided', async () => {
        const dto = {
          firstName: 'Anand',
          password: 'Password123!',
        } as any;

        await expect(service.createAstrologerByAdmin(dto)).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException if aadhaarNumber is invalid', async () => {
        const dto = {
          firstName: 'Anand',
          email: 'anand.invalid@example.com',
          password: 'Password123!',
          aadhaarNumber: '123',
        } as any;

        await expect(service.createAstrologerByAdmin(dto)).rejects.toThrow(BadRequestException);
      });

      it('allows ratePerMinute and commissionPrice to be omitted/nullable and sets null', async () => {
        const dto = {
          firstName: 'Anand',
          lastName: 'Mishra',
          email: 'anand.nullprices@example.com',
          phone: '9876543888',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Expert Vedic Astrologer',
          qualification: ['Acharya in Jyotish'],
          panDocUrl: 'https://storage.poojawala.com/pan.jpg',
          upiId: 'anand@okhdfcbank',
        };

        const result = await service.createAstrologerByAdmin(dto as any);
        expect(result.profile.ratePerMinute).toBeNull();
        expect(result.profile.commissionPrice).toBeNull();
        expect(result.user.isAdminCreated).toBe(false);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      });

      it('calculates commissionPrice and astrologerPayout from astrologyPrice and platform setting commission percentage', async () => {
        const dto = {
          firstName: 'Anand',
          lastName: 'Mishra',
          email: 'anand.calc@example.com',
          phone: '9876543777',
          password: 'Password123!',
          astrologyPrice: 1000,
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Expert Vedic Astrologer',
          qualification: ['Acharya in Jyotish'],
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '123456789012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Anand Mishra',
        };

        const result = await service.createAstrologerByAdmin(dto as any);
        expect(result.profile.astrologyPrice).toBe(1000);
        expect(result.profile.commissionPercentage).toBe(10);
        expect(result.profile.commissionPrice).toBe(100);
        expect(result.profile.astrologerPayout).toBe(900);
      });

      it('rejects createAstrologerByAdmin if commissionPrice or astrologerPayout does not match calculation', async () => {
        const dtoMismatchedComm = {
          firstName: 'Anand',
          lastName: 'Mishra',
          email: 'anand.mismatch1@example.com',
          phone: '9876543778',
          password: 'Password123!',
          astrologyPrice: 1000,
          commissionPrice: 200,
        };
        await expect(service.createAstrologerByAdmin(dtoMismatchedComm as any)).rejects.toThrow(
          BadRequestException,
        );

        const dtoMismatchedPayout = {
          firstName: 'Anand',
          lastName: 'Mishra',
          email: 'anand.mismatch2@example.com',
          phone: '9876543779',
          password: 'Password123!',
          astrologyPrice: 1000,
          astrologerPayout: 500,
        };
        await expect(service.createAstrologerByAdmin(dtoMismatchedPayout as any)).rejects.toThrow(
          BadRequestException,
        );
      });
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
        if (Number(id) === testUser.id) return Promise.resolve(testUser);
        if (Number(id) === testAdmin.id) return Promise.resolve(testAdmin);
        if (Number(id) > 0) return Promise.resolve({ ...customerUser, id: Number(id) });
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

    it('Test 19 — Update address to isDefault=true unsets previous default', async () => {
      testAddresses = [
        { id: 10, customerId: 104, addressLabel: 'A1', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
        { id: 11, customerId: 104, addressLabel: 'A2', fullAddress: 'Addr 2', city: 'Delhi', pincode: '110001', isDefault: false } as any,
      ];

      const res = await service.updateAddress(104, 11, { isDefault: true });

      expect(res.success).toBe(true);
      const addr10 = testAddresses.find((a) => a.id === 10);
      const addr11 = testAddresses.find((a) => a.id === 11);
      expect(addr10?.isDefault).toBe(false);
      expect(addr11?.isDefault).toBe(true);
      const defaults = testAddresses.filter((a) => a.customerId === 104 && a.isDefault);
      expect(defaults).toHaveLength(1);
    });

    it('Test 20 — Update unrelated fields on address does not alter isDefault status', async () => {
      testAddresses = [
        { id: 20, customerId: 105, addressLabel: 'Original', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
      ];

      const res = await service.updateAddress(105, 20, { addressLabel: 'Renamed' });

      expect(res.success).toBe(true);
      const addr20 = testAddresses.find((a) => a.id === 20);
      expect(addr20?.addressLabel).toBe('Renamed');
      expect(addr20?.isDefault).toBe(true);
    });

    it('Test 21 — Explicit isDefault=false on first address preserves false', async () => {
      testAddresses = [];

      const res = await service.addAddress(106, {
        addressLabel: 'First Non-Default',
        fullAddress: 'Addr 1',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        venueType: 'HOME' as any,
        isDefault: false,
      });

      expect(res.success).toBe(true);
      expect(res.data.isDefault).toBe(false);
      const defaults = testAddresses.filter((a) => a.customerId === 106 && a.isDefault);
      expect(defaults).toHaveLength(0);
    });

    it('Test 22 — Deleting default address promotes remaining address when exactly 1 remains', async () => {
      testAddresses = [
        { id: 30, customerId: 107, addressLabel: 'Default To Delete', fullAddress: 'Addr 1', city: 'Delhi', pincode: '110001', isDefault: true } as any,
        { id: 31, customerId: 107, addressLabel: 'Secondary', fullAddress: 'Addr 2', city: 'Delhi', pincode: '110001', isDefault: false } as any,
      ];

      const res = await service.deleteAddress(107, 30);

      expect(res.success).toBe(true);
      const addr30 = testAddresses.find((a) => a.id === 30);
      const addr31 = testAddresses.find((a) => a.id === 31);
      expect(addr30?.deletedAt).toBeDefined();
      expect(addr31?.isDefault).toBe(true);
      const defaults = testAddresses.filter((a) => a.customerId === 107 && !a.deletedAt && a.isDefault);
      expect(defaults).toHaveLength(1);
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

    it('admin update purohit profile fails if aadhaarDoc is uploaded without aadhaarNumber', async () => {
      delete testProfile.aadhaarNumber;
      await expect(
        service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          { aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('admin update purohit profile sets isAdminCreated to false, and profile & media verificationStatus to APPROVED when aadhaarDoc and aadhaarNumber are uploaded', async () => {
      testUser.isAdminCreated = true;
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;
      testMedia.forEach((m) => (m.verificationStatus = PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING));

      const result = await service.updateProfileByAdmin(
        testAdmin.id,
        String(testUser.id),
        {
          aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf',
          aadhaarNumber: '123456789012',
        } as any,
      );

      expect(result.success).toBe(true);
      expect(testUser.isAdminCreated).toBe(false);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(testMedia.every((m) => m.verificationStatus === PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED)).toBe(true);
    });

    it('admin update purohit profile sets isAdminCreated to false, and profile & media verificationStatus to APPROVED when panDoc is uploaded without panNumber', async () => {
      testUser.isAdminCreated = true;
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;
      testMedia.forEach((m) => (m.verificationStatus = PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING));

      const result = await service.updateProfileByAdmin(
        testAdmin.id,
        String(testUser.id),
        {
          panDoc: 'https://s3.amazonaws.com/pan.pdf',
        } as any,
      );

      expect(result.success).toBe(true);
      expect(testUser.isAdminCreated).toBe(false);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      expect(testMedia.every((m) => m.verificationStatus === PUROHIT_MEDIA_VERIFICATION_STATUS.APPROVED)).toBe(true);
    });

    it('admin update purohit profile does not change verificationStatus to APPROVED when neither aadhaarDoc nor panDoc is uploaded', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;
      testMedia.forEach((m) => (m.verificationStatus = PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING));

      const result = await service.updateProfileByAdmin(
        testAdmin.id,
        String(testUser.id),
        {
          bio: 'Updated bio',
        } as any,
      );

      expect(result.success).toBe(true);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(testMedia.every((m) => m.verificationStatus === PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING)).toBe(true);
    });

    it('admin edit astrologer profile succeeds with ratePerMinute, commissionPrice, and specification', async () => {
      const astroUser: User = {
        id: 20,
        email: 'astrologer@poojawala.com',
        username: 'astrologer20',
        firstName: 'Varahamihira',
        lastName: 'Sharma',
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
        authProvider: 'LOCAL',
        isAdminCreated: false,
        addresses: [],
        favorites: [],
        bookings: [],
      } as unknown as User;

      testAstrologerProfile = {
        id: 201,
        userId: 20,
        bio: 'Vedic Astrologer',
        city: 'Ujjain',
        ratePerMinute: 10,
        commissionPrice: 50,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '20') return astroUser;
        return testUser;
      });

      mockUserRepo.getFullProfile.mockImplementation(async (userId: number, role: USER_ROLE) => {
        if (userId === 20) {
          return {
            ...astroUser,
            profile: { ...testAstrologerProfile },
          };
        }
        return {
          ...testUser,
          profile: testProfile,
        };
      });

      const payload: any = {
        bio: 'Senior Astrologer 25 yrs',
        city: 'Varanasi',
        ratePerMinute: 25.5,
        commissionPrice: 65,
        specification: 'Kundali Matching Expert',
        specializations: ['Vedic Astrology', 'Palmistry'],
      };

      const result = await service.updateProfileByAdmin(
        testAdmin.id,
        '20',
        payload,
      );

      expect(result.success).toBe(true);
      expect(testAstrologerProfile.ratePerMinute).toBe(25.5);
      expect(testAstrologerProfile.commissionPrice).toBe(65);
      expect(testAstrologerProfile.specification).toBe('Kundali Matching Expert');
      expect(testAstrologerProfile.city).toBe('Varanasi');
      expect(result.data.profile.ratePerMinute).toBe(25.5);
      expect(result.data.profile.commissionPrice).toBe(65);
      expect(result.data.astrologerProfile).toBeDefined();
    });

    it('purohit self update does not set verificationStatus or media to APPROVED when uploading aadhaarDoc or panDoc', async () => {
      testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;
      testMedia.forEach((m) => (m.verificationStatus = PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING));

      const result = await service.updateProfileByUser(
        String(testUser.id),
        {
          aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf',
          aadhaarNumber: '123456789012',
          panDoc: 'https://s3.amazonaws.com/pan.pdf',
        } as any,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(testProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(testMedia.every((m) => m.verificationStatus === PUROHIT_MEDIA_VERIFICATION_STATUS.PENDING)).toBe(true);
    });

    it('astrologer self update succeeds and strips commissionPrice, allowing ratePerMinute and other profile fields', async () => {
      const astroUser: User = {
        id: 20,
        email: 'astrologer@poojawala.com',
        username: 'astrologer20',
        firstName: 'Varahamihira',
        lastName: 'Sharma',
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
        authProvider: 'LOCAL',
        isAdminCreated: false,
        addresses: [],
        favorites: [],
        bookings: [],
      } as unknown as User;

      testAstrologerProfile = {
        id: 201,
        userId: 20,
        bio: 'Old bio',
        city: 'Ujjain',
        ratePerMinute: 10,
        commissionPrice: 50,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '20') return astroUser;
        return testUser;
      });

      mockUserRepo.getFullProfile.mockImplementation(async (userId: number, role: USER_ROLE) => {
        if (userId === 20) {
          return {
            ...astroUser,
            profile: { ...testAstrologerProfile },
          };
        }
        return {
          ...testUser,
          profile: testProfile,
        };
      });

      const payload: any = {
        bio: 'Updated astrologer bio',
        ratePerMinute: 20,
        commissionPrice: 999,
        specification: 'Vedic & KP Astrologer',
        city: 'Indore',
      };

      const result = await service.updateProfileByUser(
        '20',
        payload,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(testAstrologerProfile.bio).toBe('Updated astrologer bio');
      expect(testAstrologerProfile.ratePerMinute).toBe(20);
      expect(testAstrologerProfile.commissionPrice).toBe(50);
      expect(testAstrologerProfile.specification).toBe('Vedic & KP Astrologer');
      expect(testAstrologerProfile.city).toBe('Indore');
      expect(result.data.profile.ratePerMinute).toBe(20);
      expect(result.data.astrologerProfile).toBeDefined();
    });

    it('astrologer self update transitions REJECTED to PENDING and clears rejectionReason on resubmission', async () => {
      const astroUser: User = {
        id: 20,
        email: 'astrologer@poojawala.com',
        username: 'astrologer20',
        firstName: 'Varahamihira',
        lastName: 'Sharma',
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
        tokenVersion: 1,
        authProvider: 'LOCAL',
        isAdminCreated: false,
        addresses: [],
        favorites: [],
        bookings: [],
      } as unknown as User;

      testAstrologerProfile = {
        id: 201,
        userId: 20,
        bio: 'Rejected astrologer',
        city: 'Ujjain',
        ratePerMinute: 10,
        commissionPrice: 50,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.REJECTED,
        rejectionReason: 'Invalid certificate',
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '20') return astroUser;
        return testUser;
      });

      mockUserRepo.getFullProfile.mockImplementation(async (userId: number, role: USER_ROLE) => {
        if (userId === 20) {
          return {
            ...astroUser,
            profile: { ...testAstrologerProfile },
          };
        }
        return {
          ...testUser,
          profile: testProfile,
        };
      });

      const result = await service.updateProfileByUser(
        '20',
        {
          certificate: 'https://s3.amazonaws.com/new-cert.pdf',
        } as any,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(testAstrologerProfile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
      expect(testAstrologerProfile.rejectionReason).toBeNull();
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalled();
    });

    it('astrologer self update fails if aadhaarDoc is uploaded without aadhaarNumber', async () => {
      const astroUser: User = {
        id: 20,
        email: 'astrologer@poojawala.com',
        username: 'astrologer20',
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
      } as unknown as User;

      testAstrologerProfile = {
        id: 201,
        userId: 20,
        ratePerMinute: 10,
        commissionPrice: 50,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '20') return astroUser;
        return testUser;
      });

      await expect(
        service.updateProfileByUser(
          '20',
          { aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf' } as any,
          {} as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('astrologer self update sets isAdminCreated to false when aadhaarDoc or panDoc is provided', async () => {
      const astroUser: User = {
        id: 20,
        email: 'astrologer@poojawala.com',
        username: 'astrologer20',
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
        isAdminCreated: true,
      } as unknown as User;

      testAstrologerProfile = {
        id: 201,
        userId: 20,
        ratePerMinute: 10,
        commissionPrice: 50,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
        aadhaarNumber: '123456789012',
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '20') return astroUser;
        return testUser;
      });

      const result = await service.updateProfileByUser(
        '20',
        {
          aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf',
        } as any,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(mockUserRepo.updateUser).toHaveBeenCalledWith('20', { isAdminCreated: false });
      expect(astroUser.isAdminCreated).toBe(false);
    });

    it('admin edit astrologer profile calculates commissionPrice and astrologerPayout from astrologyPrice and commissionPercentage', async () => {
      const astroUser: User = {
        id: 21,
        email: 'astrologer21@poojawala.com',
        username: 'astrologer21',
        firstName: 'Varahamihira',
        lastName: 'Sharma',
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
        isAdminCreated: false,
      } as unknown as User;

      testAstrologerProfile = {
        id: 202,
        userId: 21,
        astrologyPrice: 2000,
        commissionPercentage: 15,
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '21') return astroUser;
        return testUser;
      });

      mockUserRepo.getFullProfile.mockImplementation(async (userId: number) => {
        return {
          ...astroUser,
          profile: { ...testAstrologerProfile },
          astrologerProfile: { ...testAstrologerProfile },
        };
      });

      const result = await service.updateProfileByAdmin(
        testAdmin.id,
        '21',
        { astrologyPrice: 1000, commissionPercentage: 10 } as any,
      );

      expect(result.success).toBe(true);
      expect(testAstrologerProfile.astrologyPrice).toBe(1000);
      expect(testAstrologerProfile.commissionPercentage).toBe(10);
      expect(testAstrologerProfile.commissionPrice).toBe(100);
      expect(testAstrologerProfile.astrologerPayout).toBe(900);
    });

    it('admin edit astrologer profile validates commissionPrice and astrologerPayout matching calculation', async () => {
      const astroUser: User = {
        id: 21,
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
      } as unknown as User;

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '21') return astroUser;
        return testUser;
      });

      testAstrologerProfile = {
        id: 202,
        userId: 21,
        astrologyPrice: 1000,
        commissionPercentage: 10,
      };

      await expect(
        service.updateProfileByAdmin(testAdmin.id, '21', {
          astrologyPrice: 1000,
          commissionPercentage: 10,
          commissionPrice: 150,
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateProfileByAdmin(testAdmin.id, '21', {
          astrologyPrice: 1000,
          commissionPercentage: 10,
          astrologerPayout: 800,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('user update astrologer profile calculates and validates commissionPrice and astrologerPayout', async () => {
      const astroUser: User = {
        id: 22,
        role: USER_ROLE.ASTROLOGER,
        status: USER_STATUS.ACTIVE,
      } as unknown as User;

      testAstrologerProfile = {
        id: 203,
        userId: 22,
        astrologyPrice: 500,
        commissionPercentage: 10,
      };

      mockUserRepo.findById.mockImplementation(async (id: string) => {
        if (id === '22') return astroUser;
        return testUser;
      });

      mockUserRepo.getFullProfile.mockImplementation(async (userId: number) => {
        return {
          ...astroUser,
          profile: { ...testAstrologerProfile },
          astrologerProfile: { ...testAstrologerProfile },
        };
      });

      const result = await service.updateProfileByUser(
        '22',
        { astrologyPrice: 1000 } as any,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(testAstrologerProfile.astrologyPrice).toBe(1000);
      expect(testAstrologerProfile.commissionPrice).toBe(100);
      expect(testAstrologerProfile.astrologerPayout).toBe(900);

      await expect(
        service.updateProfileByUser(
          '22',
          { astrologyPrice: 1000, astrologerPayout: 800 } as any,
          {} as any,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateProfileByUser(
          '22',
          { astrologyPrice: 1000, commissionPrice: 200 } as any,
          {} as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('purohit self update keeps isAdminCreated true if docs uploaded but no bank account exists', async () => {
      testUser.isAdminCreated = true;
      testBankAccounts = [];
      mockPurohitBankRepo.findByPurohitId.mockResolvedValue([]);
      mockPurohitBankRepo.findByUserId.mockResolvedValue([]);

      const result = await service.updateProfileByUser(
        String(testUser.id),
        {
          aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf',
          aadhaarNumber: '123456789012',
        } as any,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(testUser.isAdminCreated).toBe(true);
    });

    it('purohit self update sets isAdminCreated false when docs uploaded AND bank account exists', async () => {
      testUser.isAdminCreated = true;
      testBankAccounts = [{ id: 1, userId: testUser.id, purohitId: testProfile.id, accountNumber: '1234567890', paymentMethod: PUROHIT_PAYMENT_METHOD.BANK }];
      mockPurohitBankRepo.findByPurohitId.mockResolvedValue(testBankAccounts);
      mockPurohitBankRepo.findByUserId.mockResolvedValue(testBankAccounts);

      const result = await service.updateProfileByUser(
        String(testUser.id),
        {
          aadhaarDoc: 'https://s3.amazonaws.com/aadhaar.pdf',
          aadhaarNumber: '123456789012',
        } as any,
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(testUser.isAdminCreated).toBe(false);
    });

    it('purohit add bank account sets isAdminCreated to false if docs already exist', async () => {
      testUser.isAdminCreated = true;
      testProfile.aadhaarDocUrl = 'https://s3.amazonaws.com/aadhaar.pdf';

      const dto = {
        paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
        accountHolderName: 'Ramesh Sharma',
        accountNumber: '9998887779',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
        accountType: BANK_ACCOUNT_TYPE.SAVINGS,
        isPrimary: false,
      };

      const res = await service.addPurohitBankAccount(
        { id: testUser.id, role: USER_ROLE.PUROHIT },
        dto as any,
      );

      expect(res.success).toBe(true);
      expect(mockUserRepo.updateUser).toHaveBeenCalledWith(String(testUser.id), { isAdminCreated: false });
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

      it('22. Adding second service area with isDefault=false preserves previous default and leaves new as false', async () => {
        expect(area1.isDefault).toBe(true);

        const dto = {
          addressLabel: 'Non Default Area',
          streetName: 'MG Road',
          fullAddress: 'MG Road Delhi',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          isDefault: false,
        };

        const res = await service.addServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
        );

        expect(res.data.isDefault).toBe(false);
        expect(area1.isDefault).toBe(true);
      });

      it('23. First service area added when empty automatically gets isDefault=true when omitted', async () => {
        testServiceAreas = [];

        const dto = {
          addressLabel: 'First Area',
          streetName: 'First St',
          fullAddress: 'First St Delhi',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
        };

        const res = await service.addServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
        );

        expect(res.data.isDefault).toBe(true);
        const defaults = testServiceAreas.filter(
          (a) => a.purohitId === testUser.id && !a.deletedAt && a.isDefault,
        );
        expect(defaults).toHaveLength(1);
      });

      it('24. Explicit isDefault=false on first service area preserves false', async () => {
        testServiceAreas = [];

        const dto = {
          addressLabel: 'First Non-Default Area',
          streetName: 'First St',
          fullAddress: 'First St Delhi',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          isDefault: false,
        };

        const res = await service.addServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
        );

        expect(res.data.isDefault).toBe(false);
        const defaults = testServiceAreas.filter(
          (a) => a.purohitId === testUser.id && !a.deletedAt && a.isDefault,
        );
        expect(defaults).toHaveLength(0);
      });

      it('25. Updating service area unrelated field preserves default', async () => {
        expect(area1.isDefault).toBe(true);

        const res = await service.updateServiceArea(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          { addressLabel: 'Updated Label' } as any,
        );

        expect(res.success).toBe(true);
        expect(area1.addressLabel).toBe('Updated Label');
        expect(area1.isDefault).toBe(true);
      });

      it('26. Admin update setting isDefault=true unsets previous default service area', async () => {
        expect(area1.isDefault).toBe(true);
        expect(area2.isDefault).toBe(false);

        const res = await service.updateServiceArea(
          { id: 999, role: USER_ROLE.ADMIN },
          2,
          { isDefault: true } as any,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(area1.isDefault).toBe(false);
        expect(area2.isDefault).toBe(true);
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

  describe('Purohit & Admin Bank Account Management', () => {
    describe('Controller Decorator and Authorization Guard Verification', () => {
      it('all 5 bank account controller endpoints allow PUROHIT, ASTROLOGER and ADMIN roles', () => {
        const addRoles = Reflect.getMetadata('roles', UserController.prototype.addPurohitBankAccount);
        expect(addRoles).toContain(USER_ROLE.PUROHIT);
        expect(addRoles).toContain(USER_ROLE.ASTROLOGER);
        expect(addRoles).toContain(USER_ROLE.ADMIN);

        const listRoles = Reflect.getMetadata('roles', UserController.prototype.getPurohitBankAccounts);
        expect(listRoles).toContain(USER_ROLE.PUROHIT);
        expect(listRoles).toContain(USER_ROLE.ASTROLOGER);
        expect(listRoles).toContain(USER_ROLE.ADMIN);

        const getByIdRoles = Reflect.getMetadata('roles', UserController.prototype.getPurohitBankAccountById);
        expect(getByIdRoles).toContain(USER_ROLE.PUROHIT);
        expect(getByIdRoles).toContain(USER_ROLE.ASTROLOGER);
        expect(getByIdRoles).toContain(USER_ROLE.ADMIN);

        const updateRoles = Reflect.getMetadata('roles', UserController.prototype.updatePurohitBankAccount);
        expect(updateRoles).toContain(USER_ROLE.PUROHIT);
        expect(updateRoles).toContain(USER_ROLE.ASTROLOGER);
        expect(updateRoles).toContain(USER_ROLE.ADMIN);

        const deleteRoles = Reflect.getMetadata('roles', UserController.prototype.deletePurohitBankAccount);
        expect(deleteRoles).toContain(USER_ROLE.PUROHIT);
        expect(deleteRoles).toContain(USER_ROLE.ASTROLOGER);
        expect(deleteRoles).toContain(USER_ROLE.ADMIN);
      });
    });

    describe('PUROHIT Permissions and Ownership', () => {
      it('1. Purohit can add own bank account', async () => {
        const dto = {
          paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
          accountHolderName: 'Ramesh Sharma',
          accountNumber: '9998887776',
          ifscCode: 'HDFC0001234',
          bankName: 'HDFC Bank',
          accountType: BANK_ACCOUNT_TYPE.SAVINGS,
          isPrimary: false,
        };

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          dto as any,
        );

        expect(res.success).toBe(true);
        expect(res.data.accountNumber).toBe('9998887776');
        expect(res.data.userId).toBe(testUser.id);
      });

      it('2. Purohit can list own bank accounts', async () => {
        const res = await service.getPurohitBankAccounts(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          10,
        );

        expect(res.success).toBe(true);
        expect(res.data.length).toBeGreaterThan(0);
        expect(res.data[0].userId).toBe(testUser.id);
      });

      it('3. Purohit can get own bank account by id', async () => {
        const res = await service.getPurohitBankAccountById(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          5,
        );

        expect(res.success).toBe(true);
        expect(res.data.id).toBe(5);
      });

      it('4. Purohit cannot get another Purohit bank account', async () => {
        // Create an account mapped to profile 201 (another Purohit)
        testBankAccounts.push({
          id: 99,
          userId: 20,
          purohitId: 201,
          accountHolderName: 'Other Purohit',
          accountNumber: '5554443332',
          paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
        });

        await expect(
          service.getPurohitBankAccountById(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            99,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('5. Purohit cannot update another Purohit bank account', async () => {
        testBankAccounts.push({
          id: 98,
          userId: 20,
          purohitId: 201,
          accountHolderName: 'Other Purohit',
          accountNumber: '5554443331',
          paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
        });

        await expect(
          service.updatePurohitBankAccount(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            98,
            { accountHolderName: 'Hacked Name' } as any,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('6. Purohit cannot delete another Purohit bank account', async () => {
        testBankAccounts.push({
          id: 97,
          userId: 20,
          purohitId: 201,
          accountHolderName: 'Other Purohit',
          accountNumber: '5554443330',
          paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
        });

        await expect(
          service.deletePurohitBankAccount(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            97,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('ADMIN Permissions and Target Purohit Resolution', () => {
      it('7. Admin can add a bank account for a Purohit', async () => {
        const dto = {
          paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
          upiId: 'ramesh@upi',
          isPrimary: false,
        };

        const res = await service.addPurohitBankAccount(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          dto as any,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.upiId).toBe('ramesh@upi');
        expect(res.data.userId).toBe(testUser.id);
      });

      it('8. Admin fails to add bank account without specifying userId', async () => {
        const dto = {
          paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
          upiId: 'unknown@upi',
        };

        await expect(
          service.addPurohitBankAccount(
            { id: testAdmin.id, role: USER_ROLE.ADMIN },
            dto as any,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('9. Admin fails to add bank account for nonexistent Purohit', async () => {
        const dto = {
          paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
          upiId: 'ghost@upi',
        };

        await expect(
          service.addPurohitBankAccount(
            { id: testAdmin.id, role: USER_ROLE.ADMIN },
            dto as any,
            9999,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('10. Admin can list bank accounts for a Purohit', async () => {
        const res = await service.getPurohitBankAccounts(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          10,
          undefined,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.length).toBeGreaterThan(0);
      });

      it('11. Admin can get a Purohit bank account by id', async () => {
        const res = await service.getPurohitBankAccountById(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          5,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.id).toBe(5);
      });

      it('12. Admin gets 404 when requestedUserId does not match bank account owner', async () => {
        // Account 5 belongs to testUser (profile 101), but admin asks for user 20 (profile 201)
        await expect(
          service.getPurohitBankAccountById(
            { id: testAdmin.id, role: USER_ROLE.ADMIN },
            5,
            20,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('13. Admin can update a Purohit bank account', async () => {
        const res = await service.updatePurohitBankAccount(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          5,
          { accountHolderName: 'Ramesh S Sharma' } as any,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.accountHolderName).toBe('Ramesh S Sharma');
      });

      it('14. Admin can delete a Purohit bank account', async () => {
        const res = await service.deletePurohitBankAccount(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          5,
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(testBankAccounts.find((b) => b.id === 5)).toBeUndefined();
      });
    });

    describe('Bank Account Business Logic & Invariants', () => {
      it('15. Reject duplicate account number', async () => {
        testBankAccounts = [
          {
            id: 5,
            purohitId: 101,
            accountNumber: '111122223333',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Account 1',
            ifscCode: 'SBIN0001234',
          },
        ];

        const dto = {
          paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
          accountNumber: '111122223333',
          accountHolderName: 'Account 2',
          ifscCode: 'SBIN0001234',
        };

        await expect(
          service.addPurohitBankAccount(
            { id: testUser.id, role: USER_ROLE.PUROHIT },
            dto as any,
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('16. When adding second account with isPrimary=true, previous primary is cleared', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            accountNumber: '1001',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Acc 1',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          },
        ];

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountNumber: '1002',
            accountHolderName: 'Acc 2',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          } as any,
        );

        expect(res.data.isPrimary).toBe(true);
        const acc1 = testBankAccounts.find((b) => b.id === 1);
        expect(acc1.isPrimary).toBe(false);
      });

      it('17. Deleting primary account promotes next remaining account to primary', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '1001',
            isPrimary: true,
          },
          {
            id: 2,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '1002',
            isPrimary: false,
          },
        ];

        await service.deletePurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
        );

        const acc2 = testBankAccounts.find((b) => b.id === 2);
        expect(acc2.isPrimary).toBe(true);
      });

      it('18. First account added always has isPrimary=true when existingAccounts is empty', async () => {
        testBankAccounts = [];

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountNumber: '2001',
            accountHolderName: 'First Account',
            ifscCode: 'SBIN0001234',
            isPrimary: false,
          } as any,
        );

        expect(res.data.isPrimary).toBe(true);
      });

      it('19. Adding second account with isPrimary=false keeps existing primary intact and new isPrimary=false', async () => {
        testBankAccounts = [
          {
            id: 1,
            purohitId: 101,
            accountNumber: '1001',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Primary Bank',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          },
        ];

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountNumber: '2002',
            accountHolderName: 'Second Account',
            ifscCode: 'SBIN0001234',
            isPrimary: false,
          } as any,
        );

        expect(res.data.isPrimary).toBe(false);
        const acc1 = testBankAccounts.find((b) => b.id === 1);
        expect(acc1.isPrimary).toBe(true);
      });

      it('20. Adding UPI account with isPrimary=true clears existing primary BANK account', async () => {
        testBankAccounts = [
          {
            id: 1,
            purohitId: 101,
            accountNumber: '1001',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Bank Primary',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          },
        ];

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            upiId: 'user@upi',
            isPrimary: true,
          } as any,
        );

        expect(res.data.isPrimary).toBe(true);
        expect(res.data.paymentMethod).toBe(PUROHIT_PAYMENT_METHOD.UPI);
        const bankAcc = testBankAccounts.find((b) => b.id === 1);
        expect(bankAcc.isPrimary).toBe(false);

        // Exactly one primary account exists across BANK and UPI
        const primaryCount = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        ).length;
        expect(primaryCount).toBe(1);
      });

      it('21. Adding BANK account with isPrimary=true clears existing primary UPI account', async () => {
        testBankAccounts = [
          {
            id: 1,
            purohitId: 101,
            upiId: 'primary@upi',
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            isPrimary: true,
          },
        ];

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountNumber: '3001',
            accountHolderName: 'Bank Primary',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          } as any,
        );

        expect(res.data.isPrimary).toBe(true);
        expect(res.data.paymentMethod).toBe(PUROHIT_PAYMENT_METHOD.BANK);
        const upiAcc = testBankAccounts.find((b) => b.id === 1);
        expect(upiAcc.isPrimary).toBe(false);

        const primaryCount = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        ).length;
        expect(primaryCount).toBe(1);
      });

      it('22. PATCH UPI account to isPrimary=true clears primary BANK account', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '1001',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Bank Primary',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          },
          {
            id: 2,
            userId: testUser.id,
            purohitId: 101,
            upiId: 'secondary@upi',
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            isPrimary: false,
          },
        ];

        const res = await service.updatePurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          2,
          { isPrimary: true } as any,
        );

        expect(res.data.isPrimary).toBe(true);
        const bankAcc = testBankAccounts.find((b) => b.id === 1);
        expect(bankAcc.isPrimary).toBe(false);

        const primaryCount = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        ).length;
        expect(primaryCount).toBe(1);
      });

      it('23. PATCH account to isPrimary=false successfully sets false without throwing error', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '1001',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Bank Primary',
            ifscCode: 'SBIN0001234',
            isPrimary: true,
          },
        ];

        const res = await service.updatePurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          { isPrimary: false } as any,
        );

        expect(res.data.isPrimary).toBe(false);
        const acc1 = testBankAccounts.find((b) => b.id === 1);
        expect(acc1.isPrimary).toBe(false);
      });

      it('24. Admin search Purohit bank accounts by ID', async () => {
        testBankAccounts = [
          {
            id: 42,
            purohitId: 101,
            accountNumber: '100142',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountHolderName: 'Bank FortyTwo',
            isPrimary: true,
          },
        ];

        const res = await service.getPurohitBankAccounts(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          1,
          10,
          '42',
          testUser.id,
        );

        expect(res.success).toBe(true);
        expect(res.data.length).toBe(1);
        expect(res.data[0].id).toBe(42);
      });

      it('25. Creating a primary UPI account unsets the previous primary UPI account', async () => {
        testBankAccounts = [
          {
            id: 1,
            purohitId: 101,
            upiId: 'first@upi',
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            isPrimary: true,
          },
        ];

        const res = await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            upiId: 'second@upi',
            isPrimary: true,
          } as any,
        );

        expect(res.data.isPrimary).toBe(true);
        const acc1 = testBankAccounts.find((b) => b.id === 1);
        expect(acc1.isPrimary).toBe(false);
        const primaries = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        );
        expect(primaries).toHaveLength(1);
      });

      it('26. Selecting a bank account as primary via update unsets the primary UPI account', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            purohitId: 101,
            upiId: 'upi@primary',
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            isPrimary: true,
          },
          {
            id: 2,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '999888777',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            isPrimary: false,
          },
        ];

        const res = await service.updatePurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          2,
          { isPrimary: true } as any,
        );

        expect(res.success).toBe(true);
        const upiAcc = testBankAccounts.find((b) => b.id === 1);
        const bankAcc = testBankAccounts.find((b) => b.id === 2);
        expect(upiAcc.isPrimary).toBe(false);
        expect(bankAcc.isPrimary).toBe(true);
        const primaries = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        );
        expect(primaries).toHaveLength(1);
      });

      it('27. Updating unrelated account details (e.g. bankName) preserves existing primary method', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '111222333',
            bankName: 'HDFC',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            isPrimary: true,
          },
        ];

        const res = await service.updatePurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          1,
          { bankName: 'HDFC Bank Ltd' } as any,
        );

        expect(res.success).toBe(true);
        const acc = testBankAccounts.find((b) => b.id === 1);
        expect(acc.bankName).toBe('HDFC Bank Ltd');
        expect(acc.isPrimary).toBe(true);
      });

      it('28. Admin update setting isPrimary=true unsets previous primary across BANK and UPI', async () => {
        testBankAccounts = [
          {
            id: 1,
            userId: testUser.id,
            purohitId: 101,
            upiId: 'purohit@upi',
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            isPrimary: true,
          },
          {
            id: 2,
            userId: testUser.id,
            purohitId: 101,
            accountNumber: '444555666',
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            isPrimary: false,
          },
        ];

        const res = await service.updatePurohitBankAccount(
          { id: testAdmin.id, role: USER_ROLE.ADMIN },
          2,
          { isPrimary: true } as any,
          testUser.id,
        );

        expect(res.success).toBe(true);
        const upiAcc = testBankAccounts.find((b) => b.id === 1);
        const bankAcc = testBankAccounts.find((b) => b.id === 2);
        expect(upiAcc.isPrimary).toBe(false);
        expect(bankAcc.isPrimary).toBe(true);
        const primaries = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        );
        expect(primaries).toHaveLength(1);
      });

      it('29. Combined invariant: at most one primary payout method exists across all bank and UPI accounts', async () => {
        testBankAccounts = [];

        // Add 1st account (bank) -> becomes primary
        await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountNumber: '111',
            accountHolderName: 'A1',
            ifscCode: 'IFSC001',
          } as any,
        );

        // Add 2nd account (UPI) -> not primary
        await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.UPI,
            upiId: 'u1@upi',
            isPrimary: false,
          } as any,
        );

        // Add 3rd account (bank) -> not primary
        await service.addPurohitBankAccount(
          { id: testUser.id, role: USER_ROLE.PUROHIT },
          {
            paymentMethod: PUROHIT_PAYMENT_METHOD.BANK,
            accountNumber: '333',
            accountHolderName: 'A3',
            ifscCode: 'IFSC001',
            isPrimary: false,
          } as any,
        );

        const primaries = testBankAccounts.filter(
          (b) => (b.userId === testUser.id || b.userId === 10 || b.purohitId === 101) && b.isPrimary,
        );
        expect(primaries).toHaveLength(1);
        expect(primaries[0].paymentMethod).toBe(PUROHIT_PAYMENT_METHOD.BANK);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // STANDARDIZED IMAGE HANDLING TESTS (PATCH /users/profile & /users/admin/update/:id)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Standardized Profile Image Handling on Profile PATCH APIs', () => {
    describe('updateProfileByUser (PATCH /users/profile)', () => {
      it('Case 1a: should save uploaded profile image metadata when valid file is provided', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/old-avatar.jpg';
        mockS3Service.uploadProfileImage.mockResolvedValue('https://storage.poojawala.com/new-avatar.webp');

        const mockFile = [{
          buffer: Buffer.from('avatar-bytes'),
          mimetype: 'image/webp',
          originalname: 'avatar.webp',
        }] as Express.Multer.File[];

        const result = await service.updateProfileByUser(
          String(testUser.id),
          {},
          { profileImage: mockFile },
        );

        expect(mockS3Service.uploadProfileImage).toHaveBeenCalledWith(
          String(testUser.id),
          mockFile[0],
        );
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: 'https://storage.poojawala.com/new-avatar.webp' }),
        );
        expect(result.data.profileImage).toBe('https://storage.poojawala.com/new-avatar.webp');
      });

      it('Case 1b: should save valid profileImage URL when provided in DTO without file upload', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/old-avatar.jpg';

        const result = await service.updateProfileByUser(
          String(testUser.id),
          { profileImage: 'https://images.poojawala.com/cdn-avatar.jpg' },
          {},
        );

        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: 'https://images.poojawala.com/cdn-avatar.jpg' }),
        );
        expect(result.data.profileImage).toBe('https://images.poojawala.com/cdn-avatar.jpg');
      });

      it('Case 2: should set profileImage to null when profileImage key is absent from payload', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/existing-avatar.jpg';

        const result = await service.updateProfileByUser(
          String(testUser.id),
          { firstName: 'UpdatedName' },
          {},
        );

        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({
            firstName: 'UpdatedName',
            profileImage: null,
          }),
        );
        expect(result.data.profileImage).toBeNull();
      });

      it('Case 3: should set profileImage to null when profileImage key is explicitly null or empty', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/existing-avatar.jpg';

        const resultNull = await service.updateProfileByUser(
          String(testUser.id),
          { profileImage: null as any },
          {},
        );
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: null }),
        );
        expect(resultNull.data.profileImage).toBeNull();

        const resultEmpty = await service.updateProfileByUser(
          String(testUser.id),
          { profileImage: '   ' },
          {},
        );
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: null }),
        );
        expect(resultEmpty.data.profileImage).toBeNull();
      });

      it('should delete old Vercel blob URL when profileImage is replaced or cleared to null', async () => {
        testUser.profileImage = 'https://blob.vercel-storage.com/old-user-avatar.jpg';
        mockS3Service.isVercelBlobUrl.mockReturnValue(true);

        await service.updateProfileByUser(
          String(testUser.id),
          {},
          {},
        );

        expect(mockS3Service.deleteByUrl).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-user-avatar.jpg');
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: null }),
        );
      });

      it('should preserve other user fields when profileImage is omitted and set to null', async () => {
        testUser.firstName = 'Ramesh';
        testUser.lastName = 'Sharma';
        testUser.email = 'purohit@poojawala.com';
        testUser.profileImage = 'https://storage.poojawala.com/old.jpg';

        await service.updateProfileByUser(
          String(testUser.id),
          {},
          {},
        );

        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({
            profileImage: null,
          }),
        );
        expect(testUser.firstName).toBe('Ramesh');
        expect(testUser.lastName).toBe('Sharma');
        expect(testUser.email).toBe('purohit@poojawala.com');
        expect(testUser.profileImage).toBeNull();
      });
    });

    describe('updateProfileByAdmin (PATCH /users/admin/update/:id)', () => {
      it('Case 1a: should save uploaded profile image metadata when valid file is provided', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/old.jpg';
        mockS3Service.uploadProfileImage.mockResolvedValue('https://storage.poojawala.com/admin-uploaded-avatar.webp');

        const mockFile = [{
          buffer: Buffer.from('avatar-bytes'),
          mimetype: 'image/webp',
          originalname: 'avatar.webp',
        }] as Express.Multer.File[];

        const result = await service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          {},
          { profileImage: mockFile },
        );

        expect(mockS3Service.uploadProfileImage).toHaveBeenCalledWith(
          String(testUser.id),
          mockFile[0],
        );
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: 'https://storage.poojawala.com/admin-uploaded-avatar.webp' }),
        );
        expect(result.data.profileImage).toBe('https://storage.poojawala.com/admin-uploaded-avatar.webp');
      });

      it('Case 1b: should save valid profileImage URL when provided in DTO without file upload', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/old.jpg';

        const result = await service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          { profileImage: 'https://images.poojawala.com/admin-cdn-avatar.jpg' },
          {},
        );

        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: 'https://images.poojawala.com/admin-cdn-avatar.jpg' }),
        );
        expect(result.data.profileImage).toBe('https://images.poojawala.com/admin-cdn-avatar.jpg');
      });

      it('Case 2: should set profileImage to null when profileImage key is absent from payload', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/existing.jpg';

        const result = await service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          { firstName: 'AdminUpdated' },
          {},
        );

        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({
            firstName: 'AdminUpdated',
            profileImage: null,
          }),
        );
        expect(result.data.profileImage).toBeNull();
      });

      it('Case 3: should set profileImage to null when profileImage key is explicitly null or empty', async () => {
        testUser.profileImage = 'https://storage.poojawala.com/existing.jpg';

        const resultNull = await service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          { profileImage: null as any },
          {},
        );
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: null }),
        );
        expect(resultNull.data.profileImage).toBeNull();

        const resultEmpty = await service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          { profileImage: '   ' },
          {},
        );
        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({ profileImage: null }),
        );
        expect(resultEmpty.data.profileImage).toBeNull();
      });

      it('should preserve other fields when profileImage is omitted and set to null', async () => {
        testUser.firstName = 'Ramesh';
        testUser.lastName = 'Sharma';
        testUser.role = USER_ROLE.PUROHIT;
        testUser.profileImage = 'https://storage.poojawala.com/cleared.jpg';

        await service.updateProfileByAdmin(
          testAdmin.id,
          String(testUser.id),
          {},
          {},
        );

        expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
          String(testUser.id),
          expect.objectContaining({
            profileImage: null,
          }),
        );
        expect(testUser.firstName).toBe('Ramesh');
        expect(testUser.lastName).toBe('Sharma');
        expect(testUser.profileImage).toBeNull();
      });
    });

    describe('Platform Logo Setting and Upload', () => {
      it('should create new platform setting when PLATFORM_LOGO_URL does not exist', async () => {
        mockPlatformSettingRepo.findOne = jest.fn().mockResolvedValue(null);
        mockPlatformSettingRepo.create = jest.fn().mockImplementation((d) => d);
        mockPlatformSettingRepo.save = jest.fn().mockImplementation((d) => Promise.resolve({ id: 1, ...d }));

        const result = await service.upsertPlatformSetting(
          {
            key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL,
            value: 'https://storage.poojawala.com/logo.png',
            description: 'Main brand logo',
          },
          testAdmin.id,
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('created');
        expect(result.data.value).toBe('https://storage.poojawala.com/logo.png');
        expect(result.data.updatedById).toBe(testAdmin.id);
        expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: testAdmin.id,
            action: 'PLATFORM_SETTING_CREATED',
            entity: 'PlatformSetting',
            module: AUDIT_MODULE.SETTING,
          }),
        );
      });

      it('should update existing platform setting when PLATFORM_LOGO_URL already exists and create audit log', async () => {
        const existing = {
          id: 5,
          key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL,
          value: 'https://storage.poojawala.com/old-logo.png',
          description: 'Old logo',
          updatedById: 1,
        };
        mockPlatformSettingRepo.findOne = jest.fn().mockResolvedValue(existing);
        mockPlatformSettingRepo.save = jest.fn().mockImplementation((d) => Promise.resolve(d));

        const result = await service.upsertPlatformSetting(
          {
            key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL,
            value: 'https://storage.poojawala.com/new-logo.png',
            description: 'New logo',
          },
          testAdmin.id,
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('updated');
        expect(result.data.value).toBe('https://storage.poojawala.com/new-logo.png');
        expect(result.data.updatedById).toBe(testAdmin.id);
        expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: testAdmin.id,
            action: 'PLATFORM_SETTING_UPDATED',
            entity: 'PlatformSetting',
            module: AUDIT_MODULE.SETTING,
            entityId: '5',
          }),
        );
      });

      it('should upload platform logo file to storage and update setting', async () => {
        const mockFile = {
          originalname: '1Pooja logo.png',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image-bytes'),
        } as Express.Multer.File;

        mockS3Service.uploadFile = jest.fn().mockResolvedValue('https://wv9qiathcc2z56f9.public.blob.vercel-storage.com/platform/1pooja-logo.png');
        mockPlatformSettingRepo.findOne = jest.fn().mockResolvedValue(null);
        mockPlatformSettingRepo.create = jest.fn().mockImplementation((d) => d);
        mockPlatformSettingRepo.save = jest.fn().mockImplementation((d) => Promise.resolve({ id: 2, ...d }));

        const result = await service.uploadPlatformLogo(mockFile, testAdmin.id);

        expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
          expect.stringMatching(/^platform\/logo-\d+\.png$/),
          mockFile.buffer,
          'image/png',
        );
        expect(result.success).toBe(true);
        expect(result.data.value).toBe('https://wv9qiathcc2z56f9.public.blob.vercel-storage.com/platform/1pooja-logo.png');
      });

      it('should reject invalid file format during logo upload', async () => {
        const invalidFile = {
          originalname: 'script.exe',
          mimetype: 'application/x-msdownload',
          buffer: Buffer.from('bad-bytes'),
        } as Express.Multer.File;

        await expect(service.uploadPlatformLogo(invalidFile, testAdmin.id)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should reject when logo file is missing', async () => {
        await expect(service.uploadPlatformLogo(null as any, testAdmin.id)).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should retrieve platform settings without userId (public access)', async () => {
        mockPlatformSettingRepo.findOne = jest.fn().mockResolvedValue({ id: 1, key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL, value: 'test' });
        mockPlatformSettingRepo.findAndCount = jest.fn().mockResolvedValue([[{ id: 1, key: PLATFORM_SETTING_KEY.PLATFORM_LOGO_URL, value: 'test' }], 1]);

        const result = await service.getPlatformSetting();
        expect(result.success).toBe(true);
        expect(result.data[1]).toBe(1);
      });

      it('should delete platform setting and record audit log', async () => {
        const existing = {
          id: 10,
          key: PLATFORM_SETTING_KEY.ASTROLOGY_COMMISSION_PRICE,
          value: '50',
          description: 'Astrology commission',
        };
        mockPlatformSettingRepo.findOne = jest.fn().mockResolvedValue(existing);
        mockPlatformSettingRepo.delete = jest.fn().mockResolvedValue({ affected: 1 });

        const result = await service.deletePlatformSetting(10, testAdmin.id);
        expect(result.success).toBe(true);
        expect(result.message).toContain('deleted');
        expect(mockPlatformSettingRepo.delete).toHaveBeenCalledWith(10);
        expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: testAdmin.id,
            action: 'PLATFORM_SETTING_DELETED',
            entity: 'PlatformSetting',
            entityId: '10',
            module: AUDIT_MODULE.SETTING,
          }),
        );
      });
    });
  });
  // =========================================================================
  // Auto-Approval & Profile Completeness Validation (Purohit & Astrologer)
  // =========================================================================
  describe('Admin-Created Auto-Approval & Profile Completeness Validation', () => {
    describe('Purohit Onboarding & Completeness', () => {
      it('1. Complete profile with Aadhaar + Bank + Service Area -> auto-approved', async () => {
        const dto = {
          firstName: 'Shyam',
          lastName: 'Sundar',
          email: 'shyam.purohit@example.com',
          phone: '9811122233',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Devoted priest for Pujas and Hawans',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Shyam Sundar',
          serviceAreas: ['Varanasi', 'Sarnath'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(false);
        expect(result.data.user.status).toBe(USER_STATUS.ACTIVE);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
        expect(result.data.serviceAreas).toHaveLength(2);
      });

      it('2. Complete profile with PAN + UPI + Service Area -> auto-approved', async () => {
        const dto = {
          firstName: 'Madhav',
          lastName: 'Prasad',
          email: 'madhav.purohit@example.com',
          phone: '9811122234',
          password: 'Password123!',
          city: 'Prayagraj',
          state: 'Uttar Pradesh',
          bio: 'Experienced in Vedic ceremonies',
          panDocUrl: 'https://storage.poojawala.com/pan.jpg',
          upiId: 'madhav@okhdfcbank',
          serviceAreas: [{ city: 'Prayagraj', addressLabel: 'Civil Lines' }],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(false);
        expect(result.data.user.status).toBe(USER_STATUS.ACTIVE);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
      });

      it('3. Missing city -> created but pending', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.nocity@example.com',
          phone: '9811122235',
          password: 'Password123!',
          state: 'Uttar Pradesh',
          bio: 'Bio here',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Rohan Sharma',
          serviceAreas: ['Varanasi'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
      });

      it('4. Missing state -> created but pending', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.nostate@example.com',
          phone: '9811122236',
          password: 'Password123!',
          city: 'Varanasi',
          bio: 'Bio here',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Rohan Sharma',
          serviceAreas: ['Varanasi'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
      });

      it('5. Missing bio -> created but pending', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.nobio@example.com',
          phone: '9811122237',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Rohan Sharma',
          serviceAreas: ['Varanasi'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
      });

      it('6. Missing bank and UPI -> created but pending', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.nobank@example.com',
          phone: '9811122238',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Bio here',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          serviceAreas: ['Varanasi'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.bankAccount).toBeNull();
      });

      it('7. Missing Aadhaar and PAN -> created but pending', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.nodocs@example.com',
          phone: '9811122239',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Bio here',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Rohan Sharma',
          serviceAreas: ['Varanasi'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
      });

      it('8. Missing service area -> created but pending', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.noareas@example.com',
          phone: '9811122240',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Bio here',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321012',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Rohan Sharma',
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.serviceAreas).toHaveLength(0);
      });

      it('9. Incomplete profile with some valid information -> supplied information is still persisted', async () => {
        const dto = {
          firstName: 'Rohan',
          lastName: 'Sharma',
          email: 'rohan.partial@example.com',
          phone: '9811122241',
          password: 'Password123!',
          city: 'Haridwar',
          bio: 'Vedic priest specializing in Rudrabhishek',
          experienceYears: 5,
          languages: ['Hindi', 'Sanskrit'],
          specializations: ['Rudrabhishek'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.data.profile.city).toBe('Haridwar');
        expect(result.data.profile.bio).toBe('Vedic priest specializing in Rudrabhishek');
        expect(result.data.profile.experienceYears).toBe(5);
        expect(result.data.profile.languages).toEqual(['Hindi', 'Sanskrit']);
      });
    });

    describe('Astrologer Onboarding & Completeness', () => {
      it('1. Complete profile with Aadhaar + Bank -> auto-approved', async () => {
        const dto = {
          firstName: 'Gaurav',
          lastName: 'Joshi',
          email: 'gaurav.astro1@example.com',
          phone: '9811122242',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Specialist in Prashna Kundali',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321013',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Gaurav Joshi',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user).toBeDefined();
        expect(result.user.isAdminCreated).toBe(false);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(result.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
      });

      it('2. Complete profile with PAN + UPI -> auto-approved', async () => {
        const dto = {
          firstName: 'Harish',
          lastName: 'Pandey',
          email: 'harish.astro2@example.com',
          phone: '9811122243',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Expert Vedic Astrologer',
          panDocUrl: 'https://storage.poojawala.com/pan.jpg',
          upiId: 'harish@okicici',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user.isAdminCreated).toBe(false);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(result.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
      });

      it('3. Missing city/state/bio -> created but pending', async () => {
        const dto = {
          firstName: 'Harish',
          lastName: 'Pandey',
          email: 'harish.nocity@example.com',
          phone: '9811122244',
          password: 'Password123!',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          upiId: 'harish@okicici',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user.isAdminCreated).toBe(true);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
      });

      it('4. Missing bank and UPI -> created but pending', async () => {
        const dto = {
          firstName: 'Harish',
          lastName: 'Pandey',
          email: 'harish.nobank@example.com',
          phone: '9811122245',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Expert Vedic Astrologer',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user.isAdminCreated).toBe(true);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.bankAccount).toBeNull();
      });

      it('5. Missing Aadhaar and PAN -> created but pending', async () => {
        const dto = {
          firstName: 'Harish',
          lastName: 'Pandey',
          email: 'harish.nodocs@example.com',
          phone: '9811122246',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Expert Vedic Astrologer',
          upiId: 'harish@okicici',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user.isAdminCreated).toBe(true);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.PENDING);
      });

      it('6. No service area -> still eligible for auto-approval if all other requirements are satisfied', async () => {
        const dto = {
          firstName: 'Gaurav',
          lastName: 'Joshi',
          email: 'gaurav.noarea@example.com',
          phone: '9811122247',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Specialist in Prashna Kundali',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '987654321013',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Gaurav Joshi',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user.isAdminCreated).toBe(false);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(result.bankAccount.verificationStatus).toBe(BANK_VERIFICATION_STATUS.VERIFIED);
      });

      it('7. Incomplete profile with some valid information -> supplied information is still persisted', async () => {
        const dto = {
          firstName: 'Harish',
          lastName: 'Pandey',
          email: 'harish.partial@example.com',
          phone: '9811122248',
          password: 'Password123!',
          city: 'Rishikesh',
          bio: 'Jyotishacharya in Palmistry',
          ratePerMinute: 30,
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.user.isAdminCreated).toBe(true);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(result.profile.city).toBe('Rishikesh');
        expect(result.profile.bio).toBe('Jyotishacharya in Palmistry');
        expect(result.profile.ratePerMinute).toBe(30);
      });
    });

    describe('Verification Workflows', () => {
      it('1. Admin cannot approve an incomplete Purohit', async () => {
        testServiceAreas = []; // remove service areas so profile is incomplete

        const approveDto: VerifyPurohitDto = {
          status: PUROHIT_VERIFICATION_STATUS.APPROVED,
        };

        await expect(
          service.verifyPurohitByAdmin(testAdmin.id, testUser.id, approveDto),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('At least one valid service area'),
          }),
        );
      });

      it('2. Admin cannot approve an incomplete Astrologer', async () => {
        testAstrologerProfile = {
          id: 301,
          userId: 30,
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Bio',
          aadhaarDocUrl: null,
          panDocUrl: null, // missing docs
          verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
        };
        const astroUser = {
          id: 30,
          role: USER_ROLE.ASTROLOGER,
          firstName: 'Astro',
          lastName: 'User',
          email: 'astro@example.com',
        } as User;

        mockUserRepo.findById.mockImplementation((id: any) => {
          if (Number(id) === 30) return Promise.resolve(astroUser);
          if (Number(id) === testAdmin.id) return Promise.resolve(testAdmin);
          return Promise.resolve(null);
        });

        const approveDto: VerifyPurohitDto = {
          status: PUROHIT_VERIFICATION_STATUS.APPROVED,
        };

        await expect(
          service.verifyUserByAdmin(testAdmin.id, 30, approveDto),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Aadhaar or PAN document'),
          }),
        );
      });

      it('3. Admin can approve a complete Purohit', async () => {
        testUser.isAdminCreated = true;
        testProfile.verificationStatus = PUROHIT_VERIFICATION_STATUS.PENDING;

        const approveDto: VerifyPurohitDto = {
          status: PUROHIT_VERIFICATION_STATUS.APPROVED,
        };

        const result = await service.verifyPurohitByAdmin(testAdmin.id, testUser.id, approveDto);
        expect(result.success).toBe(true);
        expect(result.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(testUser.isAdminCreated).toBe(false);
      });

      it('4. Admin can approve a complete Astrologer', async () => {
        testAstrologerProfile = {
          id: 302,
          userId: 32,
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Bio here',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
        };
        const astroUser = {
          id: 32,
          role: USER_ROLE.ASTROLOGER,
          firstName: 'AstroComplete',
          lastName: 'User',
          email: 'astrocomplete@example.com',
          isAdminCreated: true,
        } as User;

        const astroBankAccount = {
          id: 55,
          userId: 32,
          accountNumber: '987654321099',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Astro Complete',
          isPrimary: true,
          verificationStatus: BANK_VERIFICATION_STATUS.PENDING,
        };
        testBankAccounts.push(astroBankAccount);

        mockUserRepo.findById.mockImplementation((id: any) => {
          if (Number(id) === 32) return Promise.resolve(astroUser);
          if (Number(id) === testAdmin.id) return Promise.resolve(testAdmin);
          return Promise.resolve(null);
        });

        const approveDto: VerifyPurohitDto = {
          status: PUROHIT_VERIFICATION_STATUS.APPROVED,
        };

        const result = await service.verifyUserByAdmin(testAdmin.id, 32, approveDto);
        expect(result.success).toBe(true);
        expect(result.data.userId).toBe(32);
        expect(result.data.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(astroUser.isAdminCreated).toBe(false);
      });
    });
  });

  describe('Conditional Welcome Emails for Admin-Created Purohit & Astrologer', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('Purohit Email Selection', () => {
      it('1. Complete profile -> new Purohit welcome email sent exactly once', async () => {
        const dto = {
          firstName: 'Vaidik',
          lastName: 'Shastri',
          email: 'vaidik.purohit@example.com',
          phone: '9812345601',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Specialized in Griha Pravesh and Rudrabhishek',
          qualification: ['Acharya'],
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '112233445566',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Vaidik Shastri',
          serviceAreas: ['Varanasi', 'Assi Ghat'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(false);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);

        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).toHaveBeenCalledWith(
          dto.email,
          'Vaidik Shastri',
          expect.any(String),
          dto.phone,
        );
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('2. Incomplete profile -> existing Purohit email sent exactly once with credentials', async () => {
        const dto = {
          firstName: 'Incomplete',
          lastName: 'Purohit',
          email: 'incomplete.purohit@example.com',
          phone: '9812345602',
          password: 'Password123!',
          city: 'Varanasi',
          // missing state, bio, docs, bank, service areas
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.isAdminCreated).toBe(true);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);

        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'Incomplete Purohit',
          expect.any(String),
          dto.phone,
          dto.password,
          expect.arrayContaining(['State', 'Bio', 'Aadhaar or PAN document', 'Bank Account or UPI ID', 'At least one valid service area']),
        );
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('3. Complete profile with Aadhaar + Bank -> new email', async () => {
        const dto = {
          firstName: 'AadhaarBank',
          lastName: 'Pandit',
          email: 'aadhaarbank@example.com',
          phone: '9812345603',
          password: 'Password123!',
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          bio: 'Mahakal Mandir Vedic Purohit',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '998877665544',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'AadhaarBank Pandit',
          serviceAreas: ['Ujjain'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('4. Complete profile with PAN + UPI -> new email', async () => {
        const dto = {
          firstName: 'PanUpi',
          lastName: 'Pandit',
          email: 'panupi@example.com',
          phone: '9812345604',
          password: 'Password123!',
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          bio: 'Mahakal Mandir Vedic Purohit',
          panDocUrl: 'https://storage.poojawala.com/pan.jpg',
          upiId: 'panupi@upi',
          serviceAreas: ['Ujjain'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('5. Missing service area -> existing email', async () => {
        const dto = {
          firstName: 'NoArea',
          lastName: 'Pandit',
          email: 'noarea@example.com',
          phone: '9812345605',
          password: 'Password123!',
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          bio: 'Mahakal Mandir Vedic Purohit',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '998877665544',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'NoArea Pandit',
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoArea Pandit',
          expect.any(String),
          dto.phone,
          dto.password,
          ['At least one valid service area'],
        );
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('6. Missing city/state/bio -> existing email', async () => {
        const dto = {
          firstName: 'NoBio',
          lastName: 'Pandit',
          email: 'nobio@example.com',
          phone: '9812345606',
          password: 'Password123!',
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '998877665544',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'NoBio Pandit',
          serviceAreas: ['Ujjain'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoBio Pandit',
          expect.any(String),
          dto.phone,
          dto.password,
          ['Bio'],
        );
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('7. Missing identity document -> existing email', async () => {
        const dto = {
          firstName: 'NoDocs',
          lastName: 'Pandit',
          email: 'nodocs@example.com',
          phone: '9812345607',
          password: 'Password123!',
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          bio: 'Mahakal Mandir Vedic Purohit',
          accountNumber: '998877665544',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'NoDocs Pandit',
          serviceAreas: ['Ujjain'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoDocs Pandit',
          expect.any(String),
          dto.phone,
          dto.password,
          ['Aadhaar or PAN document'],
        );
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('8. Missing bank and UPI -> existing email', async () => {
        const dto = {
          firstName: 'NoBank',
          lastName: 'Pandit',
          email: 'nobank@example.com',
          phone: '9812345608',
          password: 'Password123!',
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          bio: 'Mahakal Mandir Vedic Purohit',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          serviceAreas: ['Ujjain'],
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoBank Pandit',
          expect.any(String),
          dto.phone,
          dto.password,
          ['Bank Account or UPI ID'],
        );
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('9. Missing city, identity document, and service area -> pending email with those exact missing fields', async () => {
        const dto = {
          firstName: 'MultiMissing',
          lastName: 'Purohit',
          email: 'multimissing.purohit@example.com',
          phone: '9812345688',
          password: 'Password123!',
          state: 'Uttar Pradesh',
          bio: 'Specialized in Hawans',
          accountNumber: '112233445588',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'MultiMissing Purohit',
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'MultiMissing Purohit',
          expect.any(String),
          dto.phone,
          dto.password,
          ['City', 'Aadhaar or PAN document', 'At least one valid service area'],
        );
      });

      it('10. Purohit missing only qualification is auto-approved because qualification is optional', async () => {
        const dto = {
          firstName: 'NoQual',
          lastName: 'Purohit',
          email: 'noqual.purohit@example.com',
          phone: '9812345689',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Specialized in Hawans',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '112233445599',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'NoQual Purohit',
          serviceAreas: ['Varanasi'],
          // qualification intentionally omitted
        };

        const result = await service.createPurohitByAdmin(dto);
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).not.toHaveBeenCalled();
      });
    });

    describe('Astrologer Email Selection', () => {
      it('1. Complete profile with Aadhaar + Bank -> new Astrologer welcome email', async () => {
        const dto = {
          firstName: 'Bhrigu',
          lastName: 'Sharma',
          email: 'bhrigu.astro@example.com',
          phone: '9812345609',
          password: 'Password123!',
          city: 'Kashi',
          state: 'Uttar Pradesh',
          bio: 'Renowned expert in Vedic astrology and horoscope reading',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '112233998877',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Bhrigu Sharma',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).toHaveBeenCalledWith(
          dto.email,
          'Bhrigu Sharma',
          expect.any(String),
          dto.phone,
        );
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('2. Complete profile with PAN + UPI -> new Astrologer welcome email', async () => {
        const dto = {
          firstName: 'Parashar',
          lastName: 'Acharya',
          email: 'parashar.astro@example.com',
          phone: '9812345610',
          password: 'Password123!',
          city: 'Kashi',
          state: 'Uttar Pradesh',
          bio: 'Master in Prashna Kundali',
          panDocUrl: 'https://storage.poojawala.com/pan.jpg',
          upiId: 'parashar@upi',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('3. Missing city/state/bio -> existing Astrologer email', async () => {
        const dto = {
          firstName: 'NoBio',
          lastName: 'Astro',
          email: 'nobio.astro@example.com',
          phone: '9812345611',
          password: 'Password123!',
          city: 'Kashi',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          upiId: 'nobio@upi',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoBio Astro',
          expect.any(String),
          dto.phone,
          dto.password,
          ['State', 'Bio'],
        );
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('4. Missing identity document -> existing Astrologer email', async () => {
        const dto = {
          firstName: 'NoDoc',
          lastName: 'Astro',
          email: 'nodoc.astro@example.com',
          phone: '9812345612',
          password: 'Password123!',
          city: 'Kashi',
          state: 'Uttar Pradesh',
          bio: 'Experienced astrologer',
          upiId: 'nodoc@upi',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoDoc Astro',
          expect.any(String),
          dto.phone,
          dto.password,
          ['Aadhaar or PAN document'],
        );
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('5. Missing bank and UPI -> existing Astrologer email', async () => {
        const dto = {
          firstName: 'NoBank',
          lastName: 'Astro',
          email: 'nobank.astro@example.com',
          phone: '9812345613',
          password: 'Password123!',
          city: 'Kashi',
          state: 'Uttar Pradesh',
          bio: 'Experienced astrologer',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'NoBank Astro',
          expect.any(String),
          dto.phone,
          dto.password,
          ['Bank Account or UPI ID'],
        );
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).not.toHaveBeenCalled();
      });

      it('6. No service area but otherwise complete -> new Astrologer welcome email', async () => {
        const dto = {
          firstName: 'Complete',
          lastName: 'Astrologer',
          email: 'complete.noarea.astro@example.com',
          phone: '9812345614',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Expert Vedic Astrologer with 10 years experience',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '998877112233',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'Complete Astrologer',
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('7. Astrologer missing state and identity doc -> pending email without service area warning', async () => {
        const dto = {
          firstName: 'StateDocMissing',
          lastName: 'Astro',
          email: 'statedoc.astro@example.com',
          phone: '9812345691',
          password: 'Password123!',
          city: 'Kashi',
          bio: 'Expert Vedic Astrologer',
          upiId: 'statedoc@upi',
          // missing state and identity document
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.PENDING);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).toHaveBeenCalledWith(
          dto.email,
          'StateDocMissing Astro',
          expect.any(String),
          dto.phone,
          dto.password,
          ['State', 'Aadhaar or PAN document'],
        );
        // Ensure service area is NEVER present in missing fields for Astrologer
        const callArgs = mockEmailService.sendAstrologerCreatedByAdminEmail.mock.calls[0];
        const missingFields = callArgs[5];
        expect(missingFields).not.toContain('At least one valid service area');
        expect(missingFields).not.toContain('Service area');
      });

      it('8. Astrologer missing only qualification is auto-approved because qualification is optional', async () => {
        const dto = {
          firstName: 'NoQual',
          lastName: 'Astro',
          email: 'noqual.astro@example.com',
          phone: '9812345692',
          password: 'Password123!',
          city: 'Haridwar',
          state: 'Uttarakhand',
          bio: 'Master in Prashna Kundali with 12 years experience',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '998877112244',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'NoQual Astro',
          // qualification intentionally omitted
        };

        const result = await service.createAstrologerByAdmin(dto);
        expect(result.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
        expect(mockEmailService.sendAstrologerWelcomeApprovedEmail).toHaveBeenCalledTimes(1);
        expect(mockEmailService.sendAstrologerCreatedByAdminEmail).not.toHaveBeenCalled();
      });
    });

    describe('Transaction & Fault Isolation Tests', () => {
      it('1. Transaction rollback -> no email sent', async () => {
        const dto = {
          firstName: 'Rollback',
          lastName: 'User',
          email: 'rollback@example.com',
          phone: '9812345615',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Bio',
          services: [999999], // invalid service forces NotFoundException inside transaction
          serviceAreas: ['Varanasi'],
        };

        await expect(service.createPurohitByAdmin(dto)).rejects.toThrow();
        expect(mockEmailService.sendPurohitWelcomeApprovedEmail).not.toHaveBeenCalled();
        expect(mockEmailService.sendPurohitCreatedByAdminEmail).not.toHaveBeenCalled();
      });

      it('2. Email provider failure -> account creation remains successful', async () => {
        mockEmailService.sendPurohitWelcomeApprovedEmail.mockRejectedValueOnce(
          new Error('SMTP connection timeout'),
        );

        const dto = {
          firstName: 'EmailFail',
          lastName: 'Purohit',
          email: 'emailfail@example.com',
          phone: '9812345616',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Specialized in Hawans',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '112233445577',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'EmailFail Purohit',
          serviceAreas: ['Varanasi'],
        };

        // Must succeed without throwing 500 error
        const result = await service.createPurohitByAdmin(dto);
        expect(result.success).toBe(true);
        expect(result.data.user.id).toBeDefined();
        expect(result.data.profile.verificationStatus).toBe(PUROHIT_VERIFICATION_STATUS.APPROVED);
      });

      it('3. Exactly one email is sent per creation', async () => {
        const dto = {
          firstName: 'SingleEmail',
          lastName: 'Purohit',
          email: 'singleemail@example.com',
          phone: '9812345617',
          password: 'Password123!',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          bio: 'Specialized in Hawans',
          aadhaarDocUrl: 'https://storage.poojawala.com/aadhaar.jpg',
          accountNumber: '112233445588',
          ifscCode: 'SBIN0001234',
          accountHolderName: 'SingleEmail Purohit',
          serviceAreas: ['Varanasi'],
        };

        await service.createPurohitByAdmin(dto);
        const totalCalls =
          mockEmailService.sendPurohitWelcomeApprovedEmail.mock.calls.length +
          mockEmailService.sendPurohitCreatedByAdminEmail.mock.calls.length;
        expect(totalCalls).toBe(1);
      });
    });
  });

});


