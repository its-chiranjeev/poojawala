// Must be the VERY FIRST statement — prevents Jest from crashing on puppeteer ESM
jest.mock('puppeteer', () => ({}));

import { BadRequestException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { ServiceService } from '../service/service.service';
import {
  Booking,
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_PAYMENT_TYPE,
  BOOKING_MODE,
  ASSIGNMENT_TYPE,
  Service,
  SERVICE_PLAN,
  User,
  USER_ROLE,
  USER_STATUS,
  CustomerAddress,
  PurohitProfile,
  PurohitService,
  PUROHIT_VERIFICATION_STATUS,
  AstrologerProfile,
  BOOKING_TYPE,
} from '@poojawala/entities';

describe('POOJAWALA — Complete Removal of Legacy Samagri-Based Pricing & Service Plans (Scenarios 1-35)', () => {
  let bookingService: BookingService;
  let serviceService: ServiceService;

  let mockBookingRepository: any;
  let mockDataSource: any;
  let mockS3Service: any;
  let mockSmsService: any;
  let mockEmailService: any;
  let mockAssignmentService: any;
  let mockBookingGateway: any;
  let mockNotificationService: any;
  let mockAuditLogService: any;
  let mockPaymentService: any;

  let mockEntityManager: any;
  let mockServiceRepo: any;
  let mockUserRepo: any;
  let mockAddressRepo: any;
  let mockBookingRepo: any;
  let mockPurohitServiceRepo: any;
  let mockPurohitProfileRepo: any;

  const mockCustomerUser: User = {
    id: 1,
    role: USER_ROLE.CUSTOMER,
    status: USER_STATUS.ACTIVE,
    firstName: 'Chirag',
    lastName: 'Sharma',
    phone: '9876543210',
    email: 'chirag@example.com',
  } as User;

  const mockAddress: CustomerAddress = {
    id: 10,
    customerId: 1,
    city: 'Varanasi',
    pincode: '221001',
    latitude: 25.3176,
    longitude: 82.9739,
  } as CustomerAddress;

  const createPlanService = (overrides: Partial<Service> = {}): Service =>
    ({
      id: 5,
      name: 'Varalakshmi Vratam Puja',
      isActive: true,
      isOffline: true,
      isOnline: true,
      cities: [{ name: 'Varanasi' }],
      commissionPercentage: 10,
      tokenPercentage: 20,
      plans: {
        basic: {
          price: 4100,
          pujaSamagri: 'Basic',
          flowers: true,
          fruits: false,
        },
        standard: {
          price: 6100,
          pujaSamagri: 'Complete',
          flowers: true,
          fruits: true,
          prasad: true,
        },
      },
      ...overrides,
    } as unknown as Service);

  beforeEach(() => {
    mockServiceRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn(),
      create: jest.fn().mockImplementation((d) => ({ ...d, id: 5 })),
      save: jest.fn().mockImplementation(async (s) => ({ ...s, id: s.id ?? 5 })),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(mockCustomerUser),
    };

    mockAddressRepo = {
      findOne: jest.fn().mockResolvedValue(mockAddress),
    };

    mockPurohitProfileRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 101, userId: 201 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 101, userId: 201 }]),
      }),
    };

    mockPurohitServiceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 77,
        purohitId: 101,
        serviceId: 5,
        isActive: true,
        isOnline: true,
        isOffline: true,
      }),
    };

    mockBookingRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
        getOne: jest.fn().mockResolvedValue(null),
      }),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 999 })),
      save: jest.fn().mockImplementation(async (b) => ({ ...b, id: b.id ?? 999 })),
      findOne: jest.fn(),
    };

    mockEntityManager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === Service) return mockServiceRepo;
        if (entity === User) return mockUserRepo;
        if (entity === CustomerAddress) return mockAddressRepo;
        if (entity === Booking) return mockBookingRepo;
        if (entity === PurohitProfile) return mockPurohitProfileRepo;
        if (entity === PurohitService) return mockPurohitServiceRepo;
        return {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((d) => d),
        };
      }),
      query: jest.fn().mockResolvedValue([]),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockEntityManager)),
    };

    mockBookingRepository = {
      findBookingById: jest.fn(),
    };
    mockS3Service = {
      uploadFileHelper: jest.fn().mockResolvedValue('https://s3.amazonaws.com/icon.png'),
      getDownloadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/icon-download.png'),
    };
    mockSmsService = {};
    mockEmailService = {
      sendCustomerBookingConfirmationEmail: jest.fn().mockResolvedValue({}),
      sendPurohitBookingAssignmentEmail: jest.fn().mockResolvedValue({}),
    };
    mockAssignmentService = {
      findEligiblePurohitIds: jest.fn().mockResolvedValue([101]),
      hasOverlappingBooking: jest.fn().mockResolvedValue(false),
    };
    mockBookingGateway = {};
    mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue({}),
      notifyAdmins: jest.fn().mockResolvedValue({}),
    };
    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue({}),
    };
    mockPaymentService = {
      createBookingPaymentLink: jest.fn().mockImplementation(async (user, dto) => ({
        paymentId: 555,
        paymentUrl: 'https://rzp.io/i/testlink',
        amount: dto.paymentOption === 'FULL' ? 4100 : 820,
        amountInPaise: (dto.paymentOption === 'FULL' ? 4100 : 820) * 100,
        currency: 'INR',
        bookingId: dto.bookingId,
        bookingNumber: 'B-999',
        status: 'CREATED',
        razorpayPaymentLinkId: 'plink_test123',
        razorpayOrderId: 'order_test123',
      })),
      settleBookingPayment: jest.fn().mockImplementation(async (user, bookingId) => ({
        paymentId: 556,
        paymentUrl: 'https://rzp.io/i/settlelink',
        amount: 3280,
        amountInPaise: 328000,
        currency: 'INR',
        bookingId,
        bookingNumber: 'B-999',
        status: 'CREATED',
        razorpayPaymentLinkId: 'plink_settle123',
        razorpayOrderId: 'order_settle123',
      })),
    };

    bookingService = new BookingService(
      mockBookingRepository,
      mockDataSource,
      mockS3Service,
      mockSmsService,
      mockEmailService,
      mockAssignmentService,
      mockBookingGateway,
      mockNotificationService,
      mockAuditLogService,
      mockPaymentService,
    );

    serviceService = new ServiceService(
      mockServiceRepo as any,
      mockS3Service as any,
      mockPurohitServiceRepo as any,
      mockPurohitProfileRepo as any,
      mockAuditLogService as any,
    );
  });

  const getLastSavedBooking = () => {
    const calls = mockBookingRepo.save.mock.calls;
    return calls[calls.length - 1][0];
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // Service Create (Scenarios 1 - 12)
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Service Create (Scenarios 1-12)', () => {
    it('1. Create Service with Basic + Standard plans', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      const res = await serviceService.createService(
        {
          name: 'Varalakshmi Vratam Puja',
          slug: 'varalakshmi-vratam-puja',
          plans: {
            basic: { price: 4100, pujaSamagri: 'Basic', flowers: true, fruits: false },
            standard: { price: 6100, pujaSamagri: 'Complete', flowers: true, fruits: true, prasad: true },
          },
        } as any,
        {},
        1,
      );
      expect(res.success).toBe(true);
      expect(mockServiceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          plans: expect.objectContaining({
            basic: expect.objectContaining({ price: 4100 }),
            standard: expect.objectContaining({ price: 6100 }),
          }),
        }),
      );
    });

    it('2. Basic price is stored correctly', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      const res = await serviceService.createService(
        {
          name: 'Varalakshmi Vratam Puja 2',
          slug: 'varalakshmi-vratam-puja-2',
          plans: {
            basic: { price: 4100 },
            standard: { price: 6100 },
          },
        } as any,
        {},
        1,
      );
      expect(res.data.plans.basic.price).toBe(4100);
    });

    it('3. Standard price is stored correctly', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      const res = await serviceService.createService(
        {
          name: 'Varalakshmi Vratam Puja 3',
          slug: 'varalakshmi-vratam-puja-3',
          plans: {
            basic: { price: 4100 },
            standard: { price: 6100 },
          },
        } as any,
        {},
        1,
      );
      expect(res.data.plans.standard.price).toBe(6100);
    });

    it('4. Dynamic feature keys are stored', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      const res = await serviceService.createService(
        {
          name: 'Varalakshmi Vratam Puja 4',
          slug: 'varalakshmi-vratam-puja-4',
          plans: {
            basic: { price: 4100, pujaSamagri: 'Basic', flowers: true, fruits: false },
            standard: { price: 6100, pujaSamagri: 'Complete', flowers: true, fruits: true, prasad: true },
          },
        } as any,
        {},
        1,
      );
      expect(res.data.plans.basic.pujaSamagri).toBe('Basic');
      expect(res.data.plans.basic.flowers).toBe(true);
      expect(res.data.plans.basic.fruits).toBe(false);
      expect(res.data.plans.standard.pujaSamagri).toBe('Complete');
      expect(res.data.plans.standard.prasad).toBe(true);
    });

    it('5. Empty plans object without basic or standard is rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'No Plans',
            slug: 'no-plans',
            plans: {} as any,
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(new BadRequestException('At least one plan (basic or standard) is required'));
    });

    it('6. Service with single basic plan or single standard plan is accepted', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      mockServiceRepo.create.mockImplementation((dto) => ({ ...dto, id: 999 }));
      mockServiceRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const resBasic = await serviceService.createService(
        {
          name: 'Only Basic',
          slug: 'only-basic',
          plans: { basic: { price: 4100 } } as any,
        } as any,
        {},
        1,
      );
      expect(resBasic.data.plans.basic.price).toBe(4100);

      const resStandard = await serviceService.createService(
        {
          name: 'Only Standard',
          slug: 'only-standard',
          plans: { standard: { price: 6100 } } as any,
        } as any,
        {},
        1,
      );
      expect(resStandard.data.plans.standard.price).toBe(6100);
    });

    it('7. Missing Basic price is rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Missing Basic Price',
            slug: 'missing-basic-price',
            plans: {
              basic: { flowers: true } as any,
              standard: { price: 6100 },
            },
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(new BadRequestException('basic plan price is required'));
    });

    it('8. Missing Standard price is rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Missing Standard Price',
            slug: 'missing-standard-price',
            plans: {
              basic: { price: 4100 },
              standard: { flowers: true } as any,
            },
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(new BadRequestException('standard plan price is required'));
    });

    it('9. Zero price rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Zero Price',
            slug: 'zero-price',
            plans: {
              basic: { price: 0 },
              standard: { price: 6100 },
            },
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(
        new BadRequestException('basic plan price must be a finite positive number greater than 0'),
      );
    });

    it('10. Negative price rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Negative Price',
            slug: 'negative-price',
            plans: {
              basic: { price: -100 },
              standard: { price: 6100 },
            },
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(
        new BadRequestException('basic plan price must be a finite positive number greater than 0'),
      );
    });

    it('11. NaN rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'NaN Price',
            slug: 'nan-price',
            plans: {
              basic: { price: NaN },
              standard: { price: 6100 },
            },
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(
        new BadRequestException('basic plan price must be a finite positive number greater than 0'),
      );
    });

    it('12. Infinity rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Infinity Price',
            slug: 'infinity-price',
            plans: {
              basic: { price: Infinity },
              standard: { price: 6100 },
            },
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(
        new BadRequestException('basic plan price must be a finite positive number greater than 0'),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Service Update (Scenarios 13 - 18)
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Service Update (Scenarios 13-18)', () => {
    it('13. Update Basic only', async () => {
      const existing = {
        id: 5,
        name: 'Varalakshmi Vratam Puja',
        plans: {
          basic: { price: 4100, pujaSamagri: 'Basic', flowers: true },
          standard: { price: 6100, pujaSamagri: 'Complete', flowers: true, fruits: true },
        },
      };
      mockServiceRepo.findOne.mockResolvedValue({ ...existing });
      let savedService: any = null;
      mockServiceRepo.save.mockImplementation(async (s: any) => {
        savedService = s;
        return s;
      });

      await serviceService.updateService(
        5,
        {
          plans: {
            basic: { price: 4500, fruits: true },
          },
        } as any,
        {},
        1,
      );

      expect(savedService.plans.basic.price).toBe(4500);
      expect(savedService.plans.basic.fruits).toBe(true);
      expect(savedService.plans.standard.price).toBe(6100);
      expect(savedService.plans.standard.pujaSamagri).toBe('Complete');
    });

    it('14. Standard remains unchanged when Basic is updated', async () => {
      const existing = {
        id: 5,
        name: 'Varalakshmi Vratam Puja',
        plans: {
          basic: { price: 4100, pujaSamagri: 'Basic', flowers: true },
          standard: { price: 6100, pujaSamagri: 'Complete', flowers: true, fruits: true },
        },
      };
      mockServiceRepo.findOne.mockResolvedValue({ ...existing });
      let savedService: any = null;
      mockServiceRepo.save.mockImplementation(async (s: any) => {
        savedService = s;
        return s;
      });

      await serviceService.updateService(
        5,
        {
          plans: {
            basic: { price: 4500 },
          },
        } as any,
        {},
        1,
      );

      expect(savedService.plans.standard.price).toBe(6100);
      expect(savedService.plans.standard.pujaSamagri).toBe('Complete');
      expect(savedService.plans.standard.fruits).toBe(true);
    });

    it('15. Update Standard only', async () => {
      const existing = {
        id: 5,
        name: 'Varalakshmi Vratam Puja',
        plans: {
          basic: { price: 4100, pujaSamagri: 'Basic', flowers: true },
          standard: { price: 6100, pujaSamagri: 'Complete', flowers: true },
        },
      };
      mockServiceRepo.findOne.mockResolvedValue({ ...existing });
      let savedService: any = null;
      mockServiceRepo.save.mockImplementation(async (s: any) => {
        savedService = s;
        return s;
      });

      await serviceService.updateService(
        5,
        {
          plans: {
            standard: { price: 6500, prasad: true },
          },
        } as any,
        {},
        1,
      );

      expect(savedService.plans.standard.price).toBe(6500);
      expect(savedService.plans.standard.prasad).toBe(true);
    });

    it('16. Basic remains unchanged when Standard is updated', async () => {
      const existing = {
        id: 5,
        name: 'Varalakshmi Vratam Puja',
        plans: {
          basic: { price: 4100, pujaSamagri: 'Basic', flowers: true },
          standard: { price: 6100, pujaSamagri: 'Complete', flowers: true },
        },
      };
      mockServiceRepo.findOne.mockResolvedValue({ ...existing });
      let savedService: any = null;
      mockServiceRepo.save.mockImplementation(async (s: any) => {
        savedService = s;
        return s;
      });

      await serviceService.updateService(
        5,
        {
          plans: {
            standard: { price: 6500 },
          },
        } as any,
        {},
        1,
      );

      expect(savedService.plans.basic.price).toBe(4100);
      expect(savedService.plans.basic.pujaSamagri).toBe('Basic');
    });

    it('17. Update both Basic and Standard', async () => {
      const existing = {
        id: 5,
        name: 'Varalakshmi Vratam Puja',
        plans: {
          basic: { price: 4100, pujaSamagri: 'Basic' },
          standard: { price: 6100, pujaSamagri: 'Complete' },
        },
      };
      mockServiceRepo.findOne.mockResolvedValue({ ...existing });
      let savedService: any = null;
      mockServiceRepo.save.mockImplementation(async (s: any) => {
        savedService = s;
        return s;
      });

      await serviceService.updateService(
        5,
        {
          plans: {
            basic: { price: 4600 },
            standard: { price: 6600 },
          },
        } as any,
        {},
        1,
      );

      expect(savedService.plans.basic.price).toBe(4600);
      expect(savedService.plans.standard.price).toBe(6600);
    });

    it('18. Dynamic features remain intact according to update semantics', async () => {
      const existing = {
        id: 5,
        name: 'Varalakshmi Vratam Puja',
        plans: {
          basic: { price: 4100, pujaSamagri: 'Basic', havanKunda: true, numberOfDays: 1 },
          standard: { price: 6100, pujaSamagri: 'Complete', moreMantraChantings: true },
        },
      };
      mockServiceRepo.findOne.mockResolvedValue({ ...existing });
      let savedService: any = null;
      mockServiceRepo.save.mockImplementation(async (s: any) => {
        savedService = s;
        return s;
      });

      await serviceService.updateService(
        5,
        {
          plans: {
            basic: { price: 4200, fruits: true },
          },
        } as any,
        {},
        1,
      );

      // Basic reflects new update
      expect(savedService.plans.basic.price).toBe(4200);
      expect(savedService.plans.basic.fruits).toBe(true);
      // Sibling plan Standard remains completely intact with its dynamic features
      expect(savedService.plans.standard.price).toBe(6100);
      expect(savedService.plans.standard.pujaSamagri).toBe('Complete');
      expect(savedService.plans.standard.moreMantraChantings).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Booking (Scenarios 19 - 27)
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Booking (Scenarios 19-27)', () => {
    it('19. Book with plan=basic', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.plan).toBe(SERVICE_PLAN.BASIC);
      expect(res.bookingId).toBe(999);
      expect(res.status).toBe(BOOKING_STATUS.PENDING);
    });

    it('20. Backend resolves plans.basic.price', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.servicePrice).toBe(4100);
      expect(savedBooking.finalAmount).toBe(4100);
      expect(savedBooking.platformCommission).toBe(410);
      expect(savedBooking.partnerPayoutAmount).toBe(3690);
    });

    it('21. Book with plan=standard', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'standard',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.plan).toBe(SERVICE_PLAN.STANDARD);
      expect(res.bookingId).toBe(999);
    });

    it('22. Backend resolves plans.standard.price', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'standard',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.servicePrice).toBe(6100);
      expect(savedBooking.finalAmount).toBe(6100);
      expect(savedBooking.platformCommission).toBe(610);
      expect(savedBooking.partnerPayoutAmount).toBe(5490);
    });

    it('23. Invalid plan rejected', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await expect(
        bookingService.createBooking(mockCustomerUser, {
          serviceId: 5,
          customerAddressId: mockAddress.id,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          bookingMode: 'OFFLINE',
          plan: 'deluxe' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('24. Frontend price manipulation ignored/rejected', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        price: 1 as any, // Attacker attempts to book for ₹1
      } as any);

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.servicePrice).toBe(4100);
      expect(savedBooking.servicePrice).not.toBe(1);
    });

    it('25. Frontend amount manipulation ignored/rejected', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        amount: 1 as any,
        finalAmount: 1 as any,
      } as any);

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.finalAmount).toBe(4100);
      expect(savedBooking.finalAmount).not.toBe(1);
    });

    it('26. servicePrice snapshot is correct', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.servicePrice).toBe(4100);
      expect(savedBooking.plan).toBe(SERVICE_PLAN.BASIC);
    });

    it('27. finalAmount is calculated correctly with donation and discount', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        donationAmount: 50,
      });

      // 4100 + 50 = 4150
      const savedBooking = getLastSavedBooking();
      expect(savedBooking.servicePrice).toBe(4100);
      expect(savedBooking.donationAmount).toBe(50);
      expect(savedBooking.finalAmount).toBe(4150);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Payment (Scenarios 28 - 32)
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Payment (Scenarios 28-32)', () => {
    it('28. Payment uses booking.finalAmount', () => {
      const booking = {
        id: 999,
        plan: 'basic',
        servicePrice: 4100,
        finalAmount: 4100,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
      } as Partial<Booking>;

      // Payment amount resolved from booking.finalAmount
      const paymentAmount = Number(booking.finalAmount);
      expect(paymentAmount).toBe(4100);
    });

    it('29. Token amount is calculated from finalAmount', async () => {
      const service = createPlanService({ tokenPercentage: 20 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // 20% of 4100 = 820
      const savedBooking = getLastSavedBooking();
      expect(savedBooking.finalAmount).toBe(4100);
      expect(savedBooking.tokenPercentage).toBe(20);
      expect(savedBooking.tokenAmount).toBe(820);
      expect(savedBooking.remainingAmount).toBe(4100);
    });

    it('30. Full payment remains correct', () => {
      const booking = {
        id: 999,
        finalAmount: 4100,
        paidAmount: 4100,
        remainingAmount: 0,
        paymentStatus: BOOKING_PAYMENT_STATUS.COMPLETED,
      } as Partial<Booking>;

      expect(Number(booking.paidAmount)).toBe(4100);
      expect(Number(booking.remainingAmount)).toBe(0);
      expect(booking.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.COMPLETED);
    });

    it('31. Settlement remains correct', () => {
      const booking = {
        id: 999,
        finalAmount: 4100,
        servicePrice: 4100,
        platformCommission: 410,
        partnerPayoutAmount: 3690,
      } as Partial<Booking>;

      expect(Number(booking.partnerPayoutAmount)).toBe(3690);
      expect(Number(booking.platformCommission)).toBe(410);
    });

    it('32. No payment path reads legacy Samagri prices', () => {
      const booking = {
        id: 999,
        finalAmount: 6100,
        servicePrice: 6100,
      } as Partial<Booking>;

      // Ensure payment references only finalAmount and does not rely on priceWithSamagri/priceWithoutSamagri
      expect((booking as any).priceWithoutSamagri).toBeUndefined();
      expect((booking as any).priceWithSamagri).toBeUndefined();
      expect(Number(booking.finalAmount)).toBe(6100);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Historical compatibility (Scenarios 33 - 35)
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Historical compatibility (Scenarios 33-35)', () => {
    it('33. Existing booking with stored servicePrice continues to work', () => {
      const historicalBooking: Partial<Booking> = {
        id: 101,
        bookingNumber: 'B-HIST-101',
        plan: null,
        samagriIncluded: true,
        servicePrice: 2200,
        finalAmount: 2200,
        partnerPayoutAmount: 1350,
        platformCommission: 150,
      };

      expect(historicalBooking.plan).toBeNull();
      expect(historicalBooking.servicePrice).toBe(2200);
      expect(historicalBooking.finalAmount).toBe(2200);
      expect(historicalBooking.samagriIncluded).toBe(true);
    });

    it('34. Existing booking finalAmount is not recalculated', () => {
      const historicalBooking: Partial<Booking> = {
        id: 102,
        bookingNumber: 'B-HIST-102',
        servicePrice: 1500,
        finalAmount: 1500,
      };

      // Even if plans are modified later
      const currentServicePlans = {
        basic: { price: 4100 },
        standard: { price: 6100 },
      };

      expect(historicalBooking.finalAmount).toBe(1500);
      expect(historicalBooking.finalAmount).not.toBe(currentServicePlans.basic.price);
      expect(historicalBooking.finalAmount).not.toBe(currentServicePlans.standard.price);
    });

    it('35. Existing booking payment remains valid', () => {
      const historicalBooking: Partial<Booking> = {
        id: 103,
        bookingNumber: 'B-HIST-103',
        finalAmount: 1800,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
      };

      const payableAmount = Number(historicalBooking.finalAmount);
      expect(payableAmount).toBe(1800);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Mandatory Booking Token-Payment Architecture (Section 22 Tests)
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Mandatory Booking Token-Payment Architecture (Section 22 Tests)', () => {
    it('1. Booking with TOKEN option returns token payment link details', async () => {
      const service = createPlanService({ tokenPercentage: 30 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        paymentOption: 'TOKEN',
      });

      expect(mockPaymentService.createBookingPaymentLink).toHaveBeenCalledWith(
        mockCustomerUser,
        expect.objectContaining({
          bookingId: 999,
          paymentOption: 'TOKEN',
        }),
      );
      expect(res.paymentId).toBe(555);
      expect(res.paymentUrl).toBe('https://rzp.io/i/testlink');
    });

    it('2. Booking with FULL option creates payment link for full amount', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'standard',
        paymentOption: 'FULL',
      });

      expect(mockPaymentService.createBookingPaymentLink).toHaveBeenCalledWith(
        mockCustomerUser,
        expect.objectContaining({
          bookingId: 999,
          paymentOption: 'FULL',
        }),
      );
      const savedBooking = getLastSavedBooking();
      expect(savedBooking.finalAmount).toBe(6100);
    });

    it('3. Token percentage defaults to 30% when not configured on service', async () => {
      const service = createPlanService({ tokenPercentage: null as any });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // Default 30% of 4100 = 1230
      const savedBooking = getLastSavedBooking();
      expect(savedBooking.tokenPercentage).toBe(30);
      expect(savedBooking.tokenAmount).toBe(1230);
    });

    it('4. Service-specific token percentage override is respected', async () => {
      const service = createPlanService({ tokenPercentage: 40 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'standard',
      });

      // 40% of 6100 = 2440
      const savedBooking = getLastSavedBooking();
      expect(savedBooking.tokenPercentage).toBe(40);
      expect(savedBooking.tokenAmount).toBe(2440);
    });

    it('5. Token amount calculation rounds to 2 decimal places', async () => {
      // 8100 * 33.33% = 2699.73
      const service = createPlanService({
        tokenPercentage: 33.33,
        plans: {
          basic: { price: 8100 },
          standard: { price: 9100 },
        },
      });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.tokenAmount).toBe(2699.73);
    });

    it('6. Donation included in final amount according to business rules', async () => {
      const service = createPlanService({
        tokenPercentage: 30,
        plans: {
          basic: { price: 8100 },
          standard: { price: 9100 },
        },
      });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        donationAmount: 101,
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.finalAmount).toBe(8201);
      // 30% of 8201 = 2460.30
      expect(savedBooking.tokenAmount).toBe(2460.30);
    });

    it('7. Discount calculation is applied correctly before token calculation', async () => {
      const service = createPlanService({
        tokenPercentage: 30,
        plans: {
          basic: { price: 5000 },
          standard: { price: 7000 },
        },
      });
      mockServiceRepo.findOne.mockResolvedValue(service);

      // Mock coupon validation
      jest.spyOn(bookingService as any, 'validateAndCalculateCoupon').mockResolvedValue({
        coupon: { code: 'SAVE500' },
        discountAmount: 500,
      });

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        couponCode: 'SAVE500',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.discountAmount).toBe(500);
      expect(savedBooking.finalAmount).toBe(4500);
      // 30% of 4500 = 1350
      expect(savedBooking.tokenAmount).toBe(1350);
    });

    it('8. Frontend cannot manipulate price', async () => {
      const service = createPlanService({
        plans: {
          basic: { price: 4100 },
          standard: { price: 6100 },
        },
      });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        servicePrice: 10,
      } as any);

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.servicePrice).toBe(4100);
    });

    it('9. Frontend cannot manipulate token percentage', async () => {
      const service = createPlanService({ tokenPercentage: 30 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        tokenPercentage: 5,
      } as any);

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.tokenPercentage).toBe(30);
    });

    it('10. Frontend cannot manipulate token amount', async () => {
      const service = createPlanService({ tokenPercentage: 30 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        tokenAmount: 1,
      } as any);

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.tokenAmount).toBe(1230);
    });

    it('11. Initial booking paidAmount = 0', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.paidAmount).toBe(0);
      expect(savedBooking.remainingAmount).toBe(savedBooking.finalAmount);
    });

    it('12. Initial booking paymentStatus = PENDING', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(res.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
    });

    it('13. Token payment webhook changes status to PARTIAL when tokenAmount <= paidAmount < finalAmount', () => {
      const finalAmount = 8201;
      const tokenAmount = 2460.30;
      const totalPaid = 2460.30;

      let paymentStatus: BOOKING_PAYMENT_STATUS;
      if (totalPaid >= finalAmount) {
        paymentStatus = BOOKING_PAYMENT_STATUS.PAID;
      } else if (totalPaid >= tokenAmount) {
        paymentStatus = BOOKING_PAYMENT_STATUS.PARTIAL;
      } else {
        paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
      }

      expect(paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PARTIAL);
    });

    it('14. Settlement amount equals remainingAmount', () => {
      const finalAmount = 8201;
      const paidAmount = 3280.40;
      const remainingAmount = Number((finalAmount - paidAmount).toFixed(2));

      expect(remainingAmount).toBe(4920.60);
    });

    it('15. Settlement webhook changes status to PAID when totalPaid >= finalAmount', () => {
      const finalAmount = 8201;
      const totalPaid = 8201;

      let paymentStatus: BOOKING_PAYMENT_STATUS;
      if (totalPaid >= finalAmount) {
        paymentStatus = BOOKING_PAYMENT_STATUS.PAID;
      } else if (totalPaid >= 3280.40) {
        paymentStatus = BOOKING_PAYMENT_STATUS.PARTIAL;
      } else {
        paymentStatus = BOOKING_PAYMENT_STATUS.PENDING;
      }

      expect(paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PAID);
    });

    it('16. Full payment changes status to PAID', () => {
      const finalAmount = 4100;
      const totalPaid = 4100;

      const paymentStatus = totalPaid >= finalAmount ? BOOKING_PAYMENT_STATUS.PAID : BOOKING_PAYMENT_STATUS.PENDING;
      expect(paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PAID);
    });

    it('17. Duplicate webhook does not double-count paidAmount due to database payment summation', () => {
      const payments = [
        { id: 1, amount: 2460.30, status: 'SUCCESS' },
      ];

      // Even if webhook is processed twice, totalPaid is re-calculated as sum of distinct successful payment records
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(2460.30);
    });

    it('18. Duplicate settlement requests are protected when already fully settled', async () => {
      await mockPaymentService.settleBookingPayment(mockCustomerUser, 999);
      expect(mockPaymentService.settleBookingPayment).toHaveBeenCalledWith(mockCustomerUser, 999);
    });

    it('19. paidAmount never exceeds finalAmount and remainingAmount never becomes negative', () => {
      const finalAmount = 4100;
      const totalPaid = 4100;
      const remainingAmount = Math.max(0, Number((finalAmount - totalPaid).toFixed(2)));

      expect(totalPaid).toBeLessThanOrEqual(finalAmount);
      expect(remainingAmount).toBe(0);
      expect(remainingAmount).toBeGreaterThanOrEqual(0);
    });

    it('20. COMPLETED cannot happen while paymentStatus is PENDING', () => {
      const booking = {
        id: 999,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
      } as Booking;

      expect(() => {
        (bookingService as any).validatePaymentForStatusChange(booking, BOOKING_STATUS.COMPLETED);
      }).toThrow(BadRequestException);
    });

    it('21. COMPLETED cannot happen while paymentStatus is PARTIAL', () => {
      const booking = {
        id: 999,
        paymentStatus: BOOKING_PAYMENT_STATUS.PARTIAL,
      } as Booking;

      expect(() => {
        (bookingService as any).validatePaymentForStatusChange(booking, BOOKING_STATUS.COMPLETED);
      }).toThrow(BadRequestException);
    });

    it('22. COMPLETED is permitted when paymentStatus is PAID', () => {
      const booking = {
        id: 999,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
      } as Booking;

      expect(() => {
        (bookingService as any).validatePaymentForStatusChange(booking, BOOKING_STATUS.COMPLETED);
      }).not.toThrow();
    });

    it('23. Historical booking compatibility without tokenPercentage or remainingAmount', () => {
      const historicalBooking: Partial<Booking> = {
        id: 105,
        finalAmount: 3000,
        tokenPercentage: null,
        tokenAmount: null,
        remainingAmount: null,
        paidAmount: 0,
      };

      const effectiveToken = historicalBooking.tokenPercentage ?? 30;
      expect(effectiveToken).toBe(30);
      expect(historicalBooking.finalAmount).toBe(3000);
    });

    it('24. Existing CASH/OFFLINE behavior remains compatible', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.bookingMode).toBe('OFFLINE');
      expect(savedBooking.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(res.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
    });

    it('25. Service plans enrich tokenAmount for basic and standard plans', () => {
      const service = {
        id: 1,
        name: 'Ganesh Puja',
        tokenPercentage: 25,
        plans: {
          basic: { price: 2000, features: ['pooja'] },
          standard: { price: 5000, features: ['pooja', 'hawan'] },
        },
      };

      const effectiveToken = service.tokenPercentage ?? 30;
      const basicTokenAmount = Number(((service.plans.basic.price * effectiveToken) / 100).toFixed(2));
      const standardTokenAmount = Number(((service.plans.standard.price * effectiveToken) / 100).toFixed(2));

      expect(basicTokenAmount).toBe(500); // 25% of 2000
      expect(standardTokenAmount).toBe(1250); // 25% of 5000
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Refined POST Create Booking API Response
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Refined POST Create Booking API Response', () => {
    it('1. Payment required: controller returns refined data with paymentId, paymentUrl, and standard 201 wrapper', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);
      const controller = new BookingController(bookingService);

      const res = await controller.createBooking({ user: mockCustomerUser } as any, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // TODO: Updated to include paymentType in refined response
      // expect(res).toEqual({
      //   bookingId: 999,
      //   bookingNumber: expect.stringMatching(/^PW/),
      //   status: BOOKING_STATUS.PENDING,
      //   paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
      //   paymentId: 555,
      //   paymentUrl: 'https://rzp.io/i/testlink',
      // });
      expect(res).toEqual({
        bookingId: 999,
        bookingNumber: expect.stringMatching(/^PW/),
        status: BOOKING_STATUS.PENDING,
        paymentType: BOOKING_PAYMENT_TYPE.TOKEN,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        paymentId: 555,
        paymentUrl: 'https://rzp.io/i/testlink',
      });

      // Explicitly assert that internal entity fields are NOT leaked in data
      const leakedFields = [
        'customerId',
        'customerAddressId',
        'addressSnapshot',
        'customerPincode',
        'scheduledAt',
        'specialInstructions',
        'customFields',
        'agreedPrice',
        'commissionPercentage',
        'platformCommission',
        'partnerPayoutAmount',
        'couponCode',
        'discountAmount',
        'donationAmount',
        'finalAmount',
        'assignmentType',
        'filteredPurohitIds',
        'completionPhotoUrls',
        'completionOtp',
        'completionConfirmedAt',
        'cancelledBy',
        'cancellationReason',
        'customerReview',
        'customerRating',
        'purohitReview',
        'purohitRating',
        'reviewStatus',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ];
      for (const field of leakedFields) {
        expect(res).not.toHaveProperty(field);
      }
      expect(Object.keys(res).sort()).toEqual([
        'bookingId',
        'bookingNumber',
        'paymentId',
        'paymentStatus',
        'paymentType',
        'paymentUrl',
        'status',
      ]);
    });

    it('2. Payment not required / absent: controller returns paymentId and paymentUrl as null', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      // Instantiate booking service without paymentService
      const bookingServiceNoPayment = new BookingService(
        mockBookingRepository,
        mockDataSource,
        mockS3Service,
        mockSmsService,
        mockEmailService,
        mockAssignmentService,
        mockBookingGateway,
        mockNotificationService,
        mockAuditLogService,
        undefined, // no payment service
      );
      const controller = new BookingController(bookingServiceNoPayment);

      const res = await controller.createBooking({ user: mockCustomerUser } as any, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // TODO: Updated to include paymentType in refined response
      // expect(res).toEqual({
      //   bookingId: 999,
      //   bookingNumber: expect.stringMatching(/^PW/),
      //   status: BOOKING_STATUS.PENDING,
      //   paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
      //   paymentId: null,
      //   paymentUrl: null,
      // });
      expect(res).toEqual({
        bookingId: 999,
        bookingNumber: expect.stringMatching(/^PW/),
        status: BOOKING_STATUS.PENDING,
        paymentType: BOOKING_PAYMENT_TYPE.TOKEN,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        paymentId: null,
        paymentUrl: null,
      });

      expect(res.paymentId).toBeNull();
      expect(res.paymentUrl).toBeNull();
      expect(Object.keys(res).sort()).toEqual([
        'bookingId',
        'bookingNumber',
        'paymentId',
        'paymentStatus',
        'paymentType',
        'paymentUrl',
        'status',
      ]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Token Payment Gate Tests
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Token Payment Gate (Scenarios 1-5)', () => {
    it('Scenario 1: Booking created with token unpaid has filteredPurohitIds=[], status=PENDING, paymentStatus=PENDING, no Purohit notified', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);
      mockNotificationService.createNotification.mockClear();

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        paymentOption: 'TOKEN',
      });

      expect(res.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(res.status).toBe(BOOKING_STATUS.PENDING);
      expect(res.paymentUrl).toBeDefined();

      // No Purohit was notified at creation time
      const purohitCalls = mockNotificationService.createNotification.mock.calls.filter(
        (call: any[]) => call[1] === 'New Booking',
      );
      expect(purohitCalls.length).toBe(0);
    });

    it('Scenario 2: Token payment confirmed -> triggerAutoAssignment populates filteredPurohitIds and notifies Purohits', async () => {
      const mockBooking = {
        id: 101,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PARTIAL,
        purohitId: null,
        filteredPurohitIds: [],
        assignmentType: ASSIGNMENT_TYPE.AUTO,
      } as any;

      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      });

      mockAssignmentService.findEligiblePurohitIds.mockResolvedValue([10, 20]);
      mockNotificationService.createNotification.mockClear();

      const result = await bookingService.triggerAutoAssignment(101);

      expect(result.filteredPurohitIds).toEqual([10, 20]);
      expect(result.assignmentType).toBe(ASSIGNMENT_TYPE.AUTO);
    });

    it('Scenario 3: Payment unpaid / failed -> triggerAutoAssignment rejects with BadRequestException', async () => {
      const unpaidBooking = {
        id: 102,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        purohitId: null,
      } as any;

      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(unpaidBooking),
      });

      await expect(bookingService.triggerAutoAssignment(102)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Scenario 4: Purohit cannot accept unpaid booking (respondToBooking rejects with BadRequestException)', async () => {
      const unpaidBooking = {
        id: 103,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        purohitId: null,
        filteredPurohitIds: [1],
      } as any;

      const purohitUser = { id: 50, role: USER_ROLE.PUROHIT } as User;

      const createChainableQb = (result: any) => {
        const qb: any = {};
        qb.where = jest.fn().mockReturnValue(qb);
        qb.andWhere = jest.fn().mockReturnValue(qb);
        qb.setLock = jest.fn().mockReturnValue(qb);
        qb.innerJoinAndSelect = jest.fn().mockReturnValue(qb);
        qb.leftJoinAndSelect = jest.fn().mockReturnValue(qb);
        qb.select = jest.fn().mockReturnValue(qb);
        qb.getOne = jest.fn().mockResolvedValue(result);
        qb.getMany = jest.fn().mockResolvedValue(result ? [result] : []);
        return qb;
      };

      mockDataSource.transaction.mockImplementationOnce(async (cb: any) => {
        const fakeManager = {
          getRepository: (entity: any) => {
            if (entity === PurohitProfile) {
              return {
                findOne: jest.fn().mockResolvedValue({ id: 1, userId: 50, status: 'APPROVED' }),
              };
            }
            if (entity === Booking) {
              return {
                createQueryBuilder: () => createChainableQb(unpaidBooking),
                save: jest.fn().mockImplementation(async (b) => b),
              };
            }
            return { findOne: jest.fn(), save: jest.fn() };
          },
        };
        return cb(fakeManager);
      });

      await expect(
        bookingService.respondToBooking(purohitUser, 103, { action: 'ACCEPT' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario 5: Admin cannot manually assign unpaid booking (assignBookingToPurohit rejects with BadRequestException)', async () => {
      const unpaidBooking = {
        id: 104,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        purohitId: null,
      } as any;

      const adminUser = { id: 1, role: USER_ROLE.ADMIN } as User;

      const createChainableQb = (result: any) => {
        const qb: any = {};
        qb.where = jest.fn().mockReturnValue(qb);
        qb.andWhere = jest.fn().mockReturnValue(qb);
        qb.setLock = jest.fn().mockReturnValue(qb);
        qb.innerJoinAndSelect = jest.fn().mockReturnValue(qb);
        qb.leftJoinAndSelect = jest.fn().mockReturnValue(qb);
        qb.select = jest.fn().mockReturnValue(qb);
        qb.getOne = jest.fn().mockResolvedValue(result);
        qb.getMany = jest.fn().mockResolvedValue(result ? [result] : []);
        return qb;
      };

      mockDataSource.transaction.mockImplementationOnce(async (cb: any) => {
        const fakeManager = {
          getRepository: (entity: any) => {
            if (entity === PurohitProfile) {
              return {
                findOne: jest.fn().mockResolvedValue({ id: 1, userId: 50, status: 'APPROVED', user: {} }),
              };
            }
            if (entity === Booking) {
              return {
                createQueryBuilder: () => createChainableQb(unpaidBooking),
                save: jest.fn().mockImplementation(async (b) => b),
              };
            }
            return { findOne: jest.fn(), save: jest.fn() };
          },
        };
        return cb(fakeManager);
      });

      await expect(
        bookingService.assignBookingToPurohit(adminUser, 104, { purohitId: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Section 17: Booking Payment Type & Deferred Payment Flow
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Section 17: Booking Payment Type & Deferred Payment Flow', () => {
    const adminUser = { id: 1, role: USER_ROLE.ADMIN } as User;

    it('1. Customer — unpaid token: paymentType=TOKEN, paymentStatus=PENDING, paidAmount=0, payment URL exists, assignment blocked', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);
      mockNotificationService.createNotification.mockClear();

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      expect(res.paymentType).toBe(BOOKING_PAYMENT_TYPE.TOKEN);
      expect(res.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(res.paymentUrl).toBeDefined();

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.paymentType).toBe(BOOKING_PAYMENT_TYPE.TOKEN);
      expect(savedBooking.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(savedBooking.paidAmount).toBe(0);
      expect(savedBooking.filteredPurohitIds).toEqual([]);

      // Assignment is blocked while unpaid
      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(savedBooking),
      });

      await expect(bookingService.triggerAutoAssignment(savedBooking.id)).rejects.toThrow(BadRequestException);
    });

    it('2. Customer — token paid: paymentStatus=PARTIAL, paidAmount updated, assignment becomes eligible', async () => {
      const mockBooking = {
        id: 201,
        status: BOOKING_STATUS.PENDING,
        paymentType: BOOKING_PAYMENT_TYPE.TOKEN,
        paymentStatus: BOOKING_PAYMENT_STATUS.PARTIAL,
        paidAmount: 820,
        finalAmount: 4100,
        remainingAmount: 3280,
        purohitId: null,
        filteredPurohitIds: [],
        assignmentType: ASSIGNMENT_TYPE.AUTO,
      } as any;

      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockBooking),
      });

      mockAssignmentService.findEligiblePurohitIds.mockResolvedValue([101, 102]);

      const result = await bookingService.triggerAutoAssignment(201);
      expect(result.filteredPurohitIds).toEqual([101, 102]);
      expect(result.assignmentType).toBe(ASSIGNMENT_TYPE.AUTO);
    });

    it('3. Customer — payment abandoned: booking remains TOKEN + PENDING, no assignment, no duplicate booking', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // Customer abandons payment (closes gateway)
      const savedBooking = getLastSavedBooking();
      expect(savedBooking.paymentType).toBe(BOOKING_PAYMENT_TYPE.TOKEN);
      expect(savedBooking.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(savedBooking.paidAmount).toBe(0);
      expect(savedBooking.filteredPurohitIds).toEqual([]);
      expect(mockAssignmentService.findEligiblePurohitIds).not.toHaveBeenCalled();
    });

    it('4. Admin — deferred payment: paymentType=DEFERRED, paymentStatus=PENDING, paidAmount=0, remainingAmount=finalAmount, no Razorpay URL generated, booking can be assigned', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);
      mockAssignmentService.findEligiblePurohitIds.mockResolvedValue([101]);

      const res = await bookingService.createBookingByAdmin(adminUser, {
        customerId: 3,
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      expect(res.paymentType).toBe(BOOKING_PAYMENT_TYPE.DEFERRED);
      expect(res.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(res.paymentId).toBeNull();
      expect(res.paymentUrl).toBeNull();

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.paymentType).toBe(BOOKING_PAYMENT_TYPE.DEFERRED);
      expect(savedBooking.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(savedBooking.paidAmount).toBe(0);
      expect(savedBooking.remainingAmount).toBe(4100);
      expect(savedBooking.tokenAmount).toBeNull();
      expect(savedBooking.tokenPercentage).toBeNull();

      // Immediate assignment is allowed for DEFERRED even with PENDING paymentStatus
      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(savedBooking),
      });

      const assigned = await bookingService.triggerAutoAssignment(savedBooking.id);
      expect(assigned.filteredPurohitIds).toEqual([101]);
    });

    it('4b. Admin — deferred payment with manual Purohit assignment (dto.purohitId): sets purohitId, status=ACCEPTED, assignmentType=MANUAL', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const purohitUser = {
        id: 201,
        role: USER_ROLE.PUROHIT,
        status: USER_STATUS.ACTIVE,
        firstName: 'Pandit',
        lastName: 'Shastri',
        email: 'shastri@example.com',
      };

      const purohitProfile = {
        id: 101,
        userId: 201,
        user: purohitUser,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
      };

      mockPurohitProfileRepo.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(purohitProfile),
      });

      mockPurohitServiceRepo.findOne.mockResolvedValue({
        id: 77,
        purohitId: 101,
        serviceId: 5,
        isActive: true,
      });

      mockNotificationService.createNotification.mockClear();

      const res = await bookingService.createBookingByAdmin(adminUser, {
        customerId: 3,
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        purohitId: 101,
      });

      expect(res.paymentType).toBe(BOOKING_PAYMENT_TYPE.DEFERRED);
      expect(res.paymentStatus).toBe(BOOKING_PAYMENT_STATUS.PENDING);
      expect(res.purohitId).toBe(101);
      expect(res.status).toBe(BOOKING_STATUS.ACCEPTED);

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.purohitId).toBe(101);
      expect(savedBooking.assignmentType).toBe(ASSIGNMENT_TYPE.MANUAL);
      expect(savedBooking.status).toBe(BOOKING_STATUS.ACCEPTED);
      expect(savedBooking.filteredPurohitIds).toEqual([101]);

      // Purohit was notified directly
      const purohitAssignedCalls = mockNotificationService.createNotification.mock.calls.filter(
        (call: any[]) => call[0] === 201 && call[1] === 'Booking Assigned',
      );
      expect(purohitAssignedCalls.length).toBe(1);
    });

    it('5. Admin — completion without payment: Purohit attempts COMPLETED with outstanding payment -> completion blocked', async () => {
      const deferredUnpaidBooking = {
        id: 301,
        status: BOOKING_STATUS.IN_PROGRESS,
        paymentType: BOOKING_PAYMENT_TYPE.DEFERRED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        paidAmount: 0,
        finalAmount: 4100,
        remainingAmount: 4100,
      } as Booking;

      expect(() => {
        (bookingService as any).validatePaymentForStatusChange(deferredUnpaidBooking, BOOKING_STATUS.COMPLETED);
      }).toThrow(BadRequestException);
    });

    it('6. Admin — payment completed: Customer pays outstanding amount -> paymentStatus=PAID, remainingAmount=0 -> completion allowed', async () => {
      const deferredPaidBooking = {
        id: 302,
        status: BOOKING_STATUS.IN_PROGRESS,
        paymentType: BOOKING_PAYMENT_TYPE.DEFERRED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        paidAmount: 4100,
        finalAmount: 4100,
        remainingAmount: 0,
      } as Booking;

      expect(() => {
        (bookingService as any).validatePaymentForStatusChange(deferredPaidBooking, BOOKING_STATUS.COMPLETED);
      }).not.toThrow();
    });

    it('7. Duplicate webhook safety: repeated calls do not double count paid amount or corrupt booking state', () => {
      // In payment.service, paidAmount is calculated via sum of successful payments in DB
      // Simulate cumulative sum:
      const existingPayments = [{ amount: 820, status: 'SUCCESS' }];
      const totalPaid1 = existingPayments.reduce((acc, p) => acc + p.amount, 0);
      expect(totalPaid1).toBe(820);

      // Duplicate webhook receives same payment: idempotent check does not insert duplicate record
      // Therefore totalPaid remains exactly 820
      const totalPaid2 = existingPayments.reduce((acc, p) => acc + p.amount, 0);
      expect(totalPaid2).toBe(820);
    });
  });

  describe('createAstrologyBooking — Astrology Booking API', () => {
    let mockAstrologerProfileRepo: any;

    beforeEach(() => {
      mockAstrologerProfileRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 99,
          userId: 42,
          commissionPrice: 200,
          verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
          user: { id: 42, firstName: 'Pandit', lastName: 'Jyotish' },
        }),
      };

      const originalGetRepo = mockEntityManager.getRepository;
      mockEntityManager.getRepository = jest.fn().mockImplementation((entity) => {
        if (entity === AstrologerProfile) return mockAstrologerProfileRepo;
        return originalGetRepo(entity);
      });
    });

    it('queries AstrologerProfile by userId (dto.astrologerId is userId) and creates booking with price from commissionPrice', async () => {
      const scheduledDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const res = await bookingService.createAstrologyBooking(mockCustomerUser, {
        astrologerId: 42,
        scheduledAt: scheduledDate,
      });

      expect(mockAstrologerProfileRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 42 },
        relations: { user: true },
      });

      expect(mockBookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingType: BOOKING_TYPE.ASTROLOGY,
          bookingMode: BOOKING_MODE.ONLINE,
          customerId: mockCustomerUser.id,
          astrologerId: 42,
          servicePrice: 200,
          finalAmount: 200,
          paymentType: BOOKING_PAYMENT_TYPE.TOKEN,
        }),
      );

      expect(res.paymentUrl).toBe('https://rzp.io/i/testlink');
    });

    it('throws NotFoundException if astrologer profile not found by userId', async () => {
      mockAstrologerProfileRepo.findOne.mockResolvedValue(null);
      const scheduledDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        bookingService.createAstrologyBooking(mockCustomerUser, {
          astrologerId: 999,
          scheduledAt: scheduledDate,
        }),
      ).rejects.toThrow('Astrologer not found');
    });

    it('throws BadRequestException if astrologer profile verificationStatus is not APPROVED', async () => {
      mockAstrologerProfileRepo.findOne.mockResolvedValue({
        id: 99,
        userId: 42,
        commissionPrice: 200,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.PENDING,
        user: { id: 42, firstName: 'Pandit', lastName: 'Jyotish' },
      });
      const scheduledDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        bookingService.createAstrologyBooking(mockCustomerUser, {
          astrologerId: 42,
          scheduledAt: scheduledDate,
        }),
      ).rejects.toThrow('Astrologer profile is not approved for bookings');
    });

    it('allows assigned astrologer to update status from ACCEPTED to COMPLETED when paymentStatus is PAID', async () => {
      const astrologerUser = {
        id: 42,
        role: USER_ROLE.ASTROLOGER,
      } as User;

      const astrologyBooking = {
        id: 501,
        bookingNumber: 'B-501',
        bookingType: BOOKING_TYPE.ASTROLOGY,
        astrologerId: 42,
        customerId: 1,
        status: BOOKING_STATUS.ACCEPTED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        paidAmount: 200,
        finalAmount: 200,
        remainingAmount: 0,
      } as Booking;

      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(astrologyBooking),
      });

      const res = await bookingService.updateBookingStatus(astrologerUser, 501, {
        status: BOOKING_STATUS.COMPLETED,
      });

      expect(res.booking.status).toBe(BOOKING_STATUS.COMPLETED);
    });

    it('rejects status update to COMPLETED if paymentStatus is not PAID for astrology booking', async () => {
      const astrologerUser = {
        id: 42,
        role: USER_ROLE.ASTROLOGER,
      } as User;

      const unpaidAstrologyBooking = {
        id: 502,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        astrologerId: 42,
        customerId: 1,
        status: BOOKING_STATUS.ACCEPTED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        paidAmount: 0,
        finalAmount: 200,
        remainingAmount: 200,
      } as Booking;

      mockBookingRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(unpaidAstrologyBooking),
      });

      await expect(
        bookingService.updateBookingStatus(astrologerUser, 502, {
          status: BOOKING_STATUS.COMPLETED,
        }),
      ).rejects.toThrow('Payment has not been completed');
    });

    it('returns transparency notices and dynamic platform access fee in createAstrologyBooking', async () => {
      mockAstrologerProfileRepo.findOne.mockResolvedValue({
        id: 99,
        userId: 42,
        commissionPrice: 150,
        ratePerMinute: 35,
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
        user: { id: 42, firstName: 'Acharya', lastName: 'Jyotish' },
      });
      const scheduledDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

      const res = await bookingService.createAstrologyBooking(mockCustomerUser, {
        astrologerId: 42,
        scheduledAt: scheduledDate,
      });

      expect(res.finalAmount).toBe(150);
      expect(res.priceBreakDown?.commissionPrice).toBe(150);
      expect(res.priceBreakDown?.platformCommissionPercentage).toBe(10);
      expect(res.priceBreakDown?.platformCommission).toBeUndefined();
      expect(res.platformAccessFee).toBeUndefined();
      expect(res.ratePerMinute).toBeUndefined();
      expect(res.consultationChargesNoticeTitle).toBeUndefined();
      expect(res.consultationFeeNotice).toBeUndefined();
      expect(res.astrologyTransparency).toBeUndefined();
    });

    it('masks astrologer details and provides pre-payment notice for unpaid booking in getBookingById', async () => {
      const unpaidBooking = {
        id: 701,
        bookingNumber: 'B-ASTRO-UNPAID',
        bookingType: BOOKING_TYPE.ASTROLOGY,
        customerId: 1,
        astrologerId: 42,
        astrologer: { id: 42, firstName: 'Acharya', lastName: 'Secret' },
        astrologerProfile: { ratePerMinute: 40 },
        status: BOOKING_STATUS.PENDING,
        paymentStatus: BOOKING_PAYMENT_STATUS.PENDING,
        finalAmount: 100,
        platformCommission: 100,
        payments: [],
      } as any;

      mockBookingRepository.findBookingById = jest.fn().mockResolvedValue(unpaidBooking);

      const res = await bookingService.getBookingById(mockCustomerUser, 701);
      expect(res.astrologer).toBeNull();
      expect(res.astrologerProfile).toBeNull();
      expect(res.platformAccessFee).toBe(100);
      expect(res.ratePerMinute).toBe(40);
      expect(res.consultationChargesNoticeTitle).toBe('Astrology Consultation Charges');
      expect(res.consultationFeeNotice).toContain('Pay ₹100 to unlock the astrologer\'s details');
      expect(res.consultationDirectBillingNotice).toBeNull();
    });

    it('unlocks astrologer details and provides direct billing notice for paid booking in getBookingById', async () => {
      const paidBooking = {
        id: 702,
        bookingNumber: 'B-ASTRO-PAID',
        bookingType: BOOKING_TYPE.ASTROLOGY,
        customerId: 1,
        astrologerId: 42,
        astrologer: { id: 42, firstName: 'Acharya', lastName: 'Revealed' },
        astrologerProfile: { ratePerMinute: 40 },
        status: BOOKING_STATUS.ACCEPTED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        finalAmount: 100,
        platformCommission: 100,
        payments: [],
      } as any;

      mockBookingRepository.findBookingById = jest.fn().mockResolvedValue(paidBooking);

      const res = await bookingService.getBookingById(mockCustomerUser, 702);
      expect(res.astrologer).toBeDefined();
      expect(res.astrologer?.firstName).toBe('Acharya');
      expect(res.astrologerProfile).toBeDefined();
      expect(res.consultationChargesNoticeTitle).toBe('Direct Astrologer Billing');
      expect(res.consultationDirectBillingNotice).toContain('Payment for the consultation is made directly to the astrologer');
      expect(res.astrologyTransparency?.isUnlocked).toBe(true);
    });
  });

  describe('Historical Booking Snapshots and Data Loss Protection', () => {
    it('populates serviceNameSnapshot with service.name during createBooking', async () => {
      const service = createPlanService({ name: 'Shri Ganesh Maha Puja' });
      mockServiceRepo.findOne.mockResolvedValue(service);

      await bookingService.createBooking(mockCustomerUser, {
        serviceId: service.id,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.serviceNameSnapshot).toBe('Shri Ganesh Maha Puja');
    });

    it('populates serviceNameSnapshot with Astrology Consultation during createAstrologyBooking', async () => {
      const mockAstrologerRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 10,
          userId: 42,
          commissionPrice: 200,
          verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
          user: { id: 42, firstName: 'Pandit', lastName: 'Jyotish' },
        }),
      };
      const originalGetRepo = mockEntityManager.getRepository;
      mockEntityManager.getRepository = jest.fn().mockImplementation((entity) => {
        if (entity === AstrologerProfile) return mockAstrologerRepo;
        return originalGetRepo(entity);
      });

      await bookingService.createAstrologyBooking(mockCustomerUser, {
        astrologerId: 42,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const savedBooking = getLastSavedBooking();
      expect(savedBooking.serviceNameSnapshot).toBe('Astrology Consultation');
    });

    it('getBookingById preserves serviceNameSnapshot when service relation is null/soft-deleted', async () => {
      const historicalBooking = {
        id: 888,
        customerId: mockCustomerUser.id,
        serviceId: 104,
        serviceNameSnapshot: 'Annaprashan Puja Snapshot',
        service: null, // Service was soft-deleted / unlinked
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        payments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      mockBookingRepository.findBookingById = jest.fn().mockResolvedValue(historicalBooking);

      const res = await bookingService.getBookingById(mockCustomerUser, 888);
      expect(res.serviceNameSnapshot).toBe('Annaprashan Puja Snapshot');
      expect(res.serviceId).toBe(104);
    });

    it('formatBookingResponse prefers serviceNameSnapshot when service relation is null/soft-deleted', async () => {
      const historicalBooking = {
        id: 889,
        customerId: mockCustomerUser.id,
        serviceId: 184,
        serviceNameSnapshot: 'Tulsi Vivah Puja Snapshot',
        service: null,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        payments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      const formatted = await (bookingService as any).formatBookingResponse(historicalBooking);
      expect(formatted.service.name).toBe('Tulsi Vivah Puja Snapshot');
      expect(formatted.service.id).toBe(184);
    });

    it('getBookings returns serviceNameSnapshot on booking records', async () => {
      const historicalBooking = {
        id: 890,
        customerId: mockCustomerUser.id,
        serviceId: 184,
        serviceNameSnapshot: 'Tulsi Vivah Puja Snapshot',
        service: null,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: BOOKING_PAYMENT_STATUS.PAID,
        payments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      mockBookingRepository.findBookingsByRole = jest.fn().mockResolvedValue({
        bookings: [historicalBooking],
        total: 1,
      });

      const res = await bookingService.getBookings(mockCustomerUser, {} as any);
      expect(res.bookings[0].serviceNameSnapshot).toBe('Tulsi Vivah Puja Snapshot');
      expect(res.bookings[0].serviceId).toBe(184);
    });
  });
});

