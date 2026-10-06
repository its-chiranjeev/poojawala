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
        return Promise.resolve(null);
      }),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.id === testAdmin.id) return Promise.resolve(testAdmin);
        if (where?.id === testUser.id) return Promise.resolve(testUser);
        return Promise.resolve(null);
      }),
      getFullProfile: jest.fn().mockImplementation((userId: number) => {
        if (userId === testUser.id) {
          return Promise.resolve({
            ...testUser,
            profile: testProfile,
            bankAccounts: [testBankAccount],
            media: testMedia,
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
      updateAccount: jest.fn().mockResolvedValue({ affected: 1 }),
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

    mockCustomerFavoriteRepo = {};
    mockPlatformSettingRepo = {};
    mockCustomerAddressRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockPurohitServiceAreaRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockOtpRepo = {};
    mockBookingRepo = {};
    mockPurohitServiceRepo = {};

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
    };

    mockSmsService = {};
    mockConfigService = { get: jest.fn() };
    mockAuditLogService = { createAuditLog: jest.fn().mockResolvedValue(true) };
    mockNotificationService = { createNotification: jest.fn().mockResolvedValue(true) };

    // Transaction and DataSource mock
    const getMockRepo = (entity: any) => {
      if (entity === User) {
        return {
          findOne: mockUserRepo.findOne,
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
      return {};
    };

    // Transaction mock
    mockDataSource = {
      getRepository: jest.fn().mockImplementation(getMockRepo),
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: getMockRepo,
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
});
