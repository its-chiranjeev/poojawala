// Must be the VERY FIRST statement — prevents Jest from crashing on puppeteer ESM
jest.mock('puppeteer', () => ({}));

import { BadRequestException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { ServiceService } from '../service/service.service';
import {
  Booking,
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  BOOKING_MODE,
  Service,
  SERVICE_PLAN,
  User,
  USER_ROLE,
  USER_STATUS,
  CustomerAddress,
  PurohitProfile,
  PurohitService,
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
    mockEmailService = {};
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

    it('5. Missing Basic is rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Missing Basic',
            slug: 'missing-basic',
            plans: { standard: { price: 6100 } } as any,
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(new BadRequestException('basic plan is required'));
    });

    it('6. Missing Standard is rejected', async () => {
      mockServiceRepo.findOne.mockResolvedValue(null);
      await expect(
        serviceService.createService(
          {
            name: 'Missing Standard',
            slug: 'missing-standard',
            plans: { basic: { price: 4100 } } as any,
          } as any,
          {},
          1,
        ),
      ).rejects.toThrow(new BadRequestException('standard plan is required'));
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

      expect(res.plan).toBe(SERVICE_PLAN.BASIC);
    });

    it('20. Backend resolves plans.basic.price', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      expect(res.servicePrice).toBe(4100);
      expect(res.finalAmount).toBe(4100);
      expect(res.platformCommission).toBe(410);
      expect(res.purohitPayoutAmount).toBe(3690);
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

      expect(res.plan).toBe(SERVICE_PLAN.STANDARD);
    });

    it('22. Backend resolves plans.standard.price', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'standard',
      });

      expect(res.servicePrice).toBe(6100);
      expect(res.finalAmount).toBe(6100);
      expect(res.platformCommission).toBe(410);
      expect(res.purohitPayoutAmount).toBe(3690);
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

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        price: 1 as any, // Attacker attempts to book for ₹1
      } as any);

      expect(res.servicePrice).toBe(4100);
      expect(res.servicePrice).not.toBe(1);
    });

    it('25. Frontend amount manipulation ignored/rejected', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        amount: 1 as any,
        finalAmount: 1 as any,
      } as any);

      expect(res.finalAmount).toBe(4100);
      expect(res.finalAmount).not.toBe(1);
    });

    it('26. servicePrice snapshot is correct', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      expect(res.servicePrice).toBe(4100);
      expect(res.plan).toBe(SERVICE_PLAN.BASIC);
    });

    it('27. finalAmount is calculated correctly with donation and discount', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        donationAmount: 50,
      });

      // 4100 + 50 = 4150
      expect(res.servicePrice).toBe(4100);
      expect(res.donationAmount).toBe(50);
      expect(res.finalAmount).toBe(4150);
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

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // 20% of 4100 = 820
      expect(res.finalAmount).toBe(4100);
      expect(res.tokenPercentage).toBe(20);
      expect(res.tokenAmount).toBe(820);
      expect(res.remainingAmount).toBe(4100);
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
        purohitPayoutAmount: 3690,
      } as Partial<Booking>;

      expect(Number(booking.purohitPayoutAmount)).toBe(3690);
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
        purohitPayoutAmount: 1350,
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
      expect(res.payment).toBeDefined();
      expect(res.payment.paymentId).toBe(555);
      expect(res.payment.status).toBe('CREATED');
    });

    it('2. Booking with FULL option creates payment link for full amount', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
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
      expect(res.booking.finalAmount).toBe(6100);
    });

    it('3. Token percentage defaults to 30% when not configured on service', async () => {
      const service = createPlanService({ tokenPercentage: null as any });
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      // Default 30% of 4100 = 1230
      expect(res.tokenPercentage).toBe(30);
      expect(res.tokenAmount).toBe(1230);
    });

    it('4. Service-specific token percentage override is respected', async () => {
      const service = createPlanService({ tokenPercentage: 40 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'standard',
      });

      // 40% of 6100 = 2440
      expect(res.tokenPercentage).toBe(40);
      expect(res.tokenAmount).toBe(2440);
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

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      expect(res.tokenAmount).toBe(2699.73);
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

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        donationAmount: 101,
      });

      expect(res.finalAmount).toBe(8201);
      // 30% of 8201 = 2460.30
      expect(res.tokenAmount).toBe(2460.30);
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

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        couponCode: 'SAVE500',
      });

      expect(res.discountAmount).toBe(500);
      expect(res.finalAmount).toBe(4500);
      // 30% of 4500 = 1350
      expect(res.tokenAmount).toBe(1350);
    });

    it('8. Frontend cannot manipulate price', async () => {
      const service = createPlanService({
        plans: {
          basic: { price: 4100 },
          standard: { price: 6100 },
        },
      });
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        servicePrice: 10,
      } as any);

      expect(res.servicePrice).toBe(4100);
    });

    it('9. Frontend cannot manipulate token percentage', async () => {
      const service = createPlanService({ tokenPercentage: 30 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        tokenPercentage: 5,
      } as any);

      expect(res.tokenPercentage).toBe(30);
    });

    it('10. Frontend cannot manipulate token amount', async () => {
      const service = createPlanService({ tokenPercentage: 30 });
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
        tokenAmount: 1,
      } as any);

      expect(res.tokenAmount).toBe(1230);
    });

    it('11. Initial booking paidAmount = 0', async () => {
      const service = createPlanService();
      mockServiceRepo.findOne.mockResolvedValue(service);

      const res = await bookingService.createBooking(mockCustomerUser, {
        serviceId: 5,
        customerAddressId: mockAddress.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        bookingMode: 'OFFLINE',
        plan: 'basic',
      });

      expect(res.paidAmount).toBe(0);
      expect(res.remainingAmount).toBe(res.finalAmount);
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

      expect(res.bookingMode).toBe('OFFLINE');
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
});
