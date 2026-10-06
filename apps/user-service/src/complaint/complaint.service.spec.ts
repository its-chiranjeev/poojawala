import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ComplaintService } from './complaint.service';
import {
  Booking,
  COMPLAINT_CATEGORY,
  COMPLAINT_STATUS,
  PurohitProfile,
  User,
  USER_ROLE,
  USER_STATUS,
  NOTIFICATION_TYPE,
  AUDIT_MODULE,
  ACTOR_TYPE,
} from '@poojawala/entities';
import { CreateComplaintDto } from '@poojawala/dtos';

describe('ComplaintService - Booking and General Complaints', () => {
  let service: ComplaintService;

  let mockBookingRepository: any;
  let mockPurohitProfileRepository: any;
  let mockComplaintRepository: any;
  let mockS3Service: any;
  let mockAuditLogService: any;
  let mockNotificationService: any;

  let testCustomer: User;
  let testPurohitUser: User;
  let testPurohitProfile: PurohitProfile;
  let testBooking: Booking;

  beforeEach(() => {
    testCustomer = {
      id: 1,
      email: 'customer@test.com',
      username: 'customer1',
      firstName: 'Rahul',
      lastName: 'Sharma',
      role: USER_ROLE.CUSTOMER,
      status: USER_STATUS.ACTIVE,
    } as unknown as User;

    testPurohitUser = {
      id: 2,
      email: 'purohit@test.com',
      username: 'purohit1',
      firstName: 'Acharya',
      lastName: 'Shastri',
      role: USER_ROLE.PUROHIT,
      status: USER_STATUS.ACTIVE,
    } as unknown as User;

    testPurohitProfile = {
      id: 10,
      userId: 2,
    } as unknown as PurohitProfile;

    testBooking = {
      id: 100,
      bookingNumber: 'BK12345',
      customerId: 1,
      purohitId: 10,
      customer: testCustomer,
      purohit: testPurohitProfile,
    } as unknown as Booking;

    mockBookingRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(() => Promise.resolve(testBooking)),
      }),
    };

    mockPurohitProfileRepository = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where.userId === testPurohitUser.id) {
          return Promise.resolve(testPurohitProfile);
        }
        return Promise.resolve(null);
      }),
    };

    mockComplaintRepository = {
      create: jest.fn().mockImplementation((data: any) => ({
        id: 501,
        ...data,
      })),
      save: jest.fn().mockImplementation((complaint: any) => Promise.resolve(complaint)),
      findByComplaintNumber: jest.fn().mockResolvedValue(null),
      hasActiveComplaintForBooking: jest.fn().mockResolvedValue(false),
      findComplaintById: jest.fn(),
      findComplaints: jest.fn(),
      softDeleteComplaint: jest.fn(),
      findDeletedComplaintById: jest.fn(),
      restoreComplaint: jest.fn(),
    };

    mockS3Service = {
      uploadFile: jest.fn().mockResolvedValue('https://s3.amazonaws.com/evidence.jpg'),
      getAttachmentDownloadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/download.jpg'),
      deleteFile: jest.fn().mockResolvedValue(true),
    };

    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(true),
    };

    mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 1 }),
      notifyAdmins: jest.fn().mockResolvedValue([{ id: 1 }]),
    };

    service = new ComplaintService(
      mockBookingRepository,
      mockPurohitProfileRepository,
      mockComplaintRepository,
      mockS3Service,
      mockAuditLogService,
      mockNotificationService,
    );
  });

  // =========================================================================
  // Test 4 — Booking complaint from CUSTOMER
  // =========================================================================
  describe('Test 4 — Booking complaint from CUSTOMER', () => {
    it('creates booking complaint and sends admin notification with booking info', async () => {
      const dto: CreateComplaintDto = {
        bookingId: 100,
        subject: 'Issue with assigned Purohit',
        description: 'The assigned Purohit did not arrive at the scheduled time.',
      };

      const result = await service.createComplaint(testCustomer, dto, []);

      expect(result.message).toBe('Complaint created successfully');
      expect(result.data.bookingId).toBe(100);
      expect(result.data.subject).toBe('Issue with assigned Purohit');

      // Verify audit log
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: testCustomer.id,
          actorRole: USER_ROLE.CUSTOMER,
          action: 'COMPLAINT_CREATED',
          newValue: expect.objectContaining({
            bookingId: 100,
            complaintType: 'BOOKING',
          }),
        }),
      );

      // Verify Admin Notification
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'New Booking Complaint',
        expect.stringContaining('New booking complaint received from Rahul Sharma for Booking #BK12345: Issue with assigned Purohit'),
        NOTIFICATION_TYPE.BOOKING,
        501,
        'COMPLAINT',
        expect.objectContaining({
          complaintId: 501,
          bookingId: 100,
          bookingNumber: 'BK12345',
          raisedById: testCustomer.id,
          raisedByName: 'Rahul Sharma',
        }),
      );
    });
  });

  // =========================================================================
  // Test 5 — Booking complaint from PUROHIT
  // =========================================================================
  describe('Test 5 — Booking complaint from PUROHIT', () => {
    it('creates booking complaint from assigned purohit and notifies admin', async () => {
      const dto: CreateComplaintDto = {
        bookingId: 100,
        subject: 'Customer address unreachable',
        description: 'The customer phone is switched off and address not found.',
      };

      const result = await service.createComplaint(testPurohitUser, dto, []);

      expect(result.message).toBe('Complaint created successfully');
      expect(result.data.bookingId).toBe(100);

      // Verify Admin Notification
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'New Booking Complaint',
        expect.stringContaining('New booking complaint received from Acharya Shastri for Booking #BK12345: Customer address unreachable'),
        NOTIFICATION_TYPE.BOOKING,
        501,
        'COMPLAINT',
        expect.objectContaining({
          complaintId: 501,
          bookingId: 100,
          bookingNumber: 'BK12345',
          raisedById: testPurohitUser.id,
          raisedByName: 'Acharya Shastri',
        }),
      );
    });
  });

  // =========================================================================
  // Test 6 — General CUSTOMER complaint (bookingId omitted)
  // =========================================================================
  describe('Test 6 — General CUSTOMER complaint', () => {
    it('creates general complaint without booking query and notifies admin', async () => {
      const dto: CreateComplaintDto = {
        subject: 'General account issue',
        description: 'I am unable to update my profile information.',
      };

      const result = await service.createComplaint(testCustomer, dto, []);

      expect(result.message).toBe('Complaint created successfully');
      expect(result.data.bookingId).toBeUndefined();

      // Booking repository should NOT be queried
      expect(mockBookingRepository.createQueryBuilder).not.toHaveBeenCalled();

      // Verify audit log
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: testCustomer.id,
          action: 'COMPLAINT_CREATED',
          newValue: expect.objectContaining({
            bookingId: null,
            complaintType: 'GENERAL',
          }),
        }),
      );

      // Verify Admin Notification: NO booking ID in message or payload
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'New General Complaint',
        'New general complaint received from Rahul Sharma: General account issue.',
        NOTIFICATION_TYPE.SYSTEM,
        501,
        'COMPLAINT',
        expect.objectContaining({
          complaintId: 501,
          raisedById: testCustomer.id,
          raisedByName: 'Rahul Sharma',
        }),
      );

      // Payload should not contain bookingId
      const payloadArg = mockNotificationService.notifyAdmins.mock.calls[0][5];
      expect(payloadArg.bookingId).toBeUndefined();
    });
  });

  // =========================================================================
  // Test 7 — General PUROHIT complaint (bookingId omitted)
  // =========================================================================
  describe('Test 7 — General PUROHIT complaint', () => {
    it('creates general complaint from purohit and notifies admin without booking ID', async () => {
      const dto: CreateComplaintDto = {
        subject: 'Payout issue enquiry',
        description: 'My weekly payout summary did not update properly.',
      };

      const result = await service.createComplaint(testPurohitUser, dto, []);

      expect(result.message).toBe('Complaint created successfully');
      expect(result.data.bookingId).toBeUndefined();

      // Booking repository should NOT be queried
      expect(mockBookingRepository.createQueryBuilder).not.toHaveBeenCalled();

      // Verify Admin Notification
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'New General Complaint',
        'New general complaint received from Acharya Shastri: Payout issue enquiry.',
        NOTIFICATION_TYPE.SYSTEM,
        501,
        'COMPLAINT',
        expect.objectContaining({
          complaintId: 501,
          raisedById: testPurohitUser.id,
          raisedByName: 'Acharya Shastri',
        }),
      );
    });
  });

  // =========================================================================
  // Test 8 — Invalid booking ID
  // =========================================================================
  describe('Test 8 — Invalid booking ID', () => {
    it('throws NotFoundException when bookingId does not exist, and sends no notification', async () => {
      mockBookingRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const dto: CreateComplaintDto = {
        bookingId: 99999,
        subject: 'Nonexistent booking',
        description: 'Trying to complain about invalid booking.',
      };

      await expect(service.createComplaint(testCustomer, dto, [])).rejects.toThrow(
        NotFoundException,
      );

      expect(mockComplaintRepository.save).not.toHaveBeenCalled();
      expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Test 9 — Unauthorized booking complaint
  // =========================================================================
  describe('Test 9 — Unauthorized booking complaint', () => {
    it('customer cannot complain about another customer booking', async () => {
      const otherCustomerBooking = {
        ...testBooking,
        customerId: 999, // different customer
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(otherCustomerBooking),
      });

      const dto: CreateComplaintDto = {
        bookingId: 100,
        subject: 'Unauthorized complaint',
        description: 'Trying to complain against other booking.',
      };

      await expect(service.createComplaint(testCustomer, dto, [])).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockComplaintRepository.save).not.toHaveBeenCalled();
      expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
    });

    it('purohit cannot complain about a booking assigned to another purohit', async () => {
      const otherPurohitBooking = {
        ...testBooking,
        purohitId: 888, // different purohit profile
      };

      mockBookingRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(otherPurohitBooking),
      });

      const dto: CreateComplaintDto = {
        bookingId: 100,
        subject: 'Unauthorized purohit complaint',
        description: 'Trying to complain against other booking.',
      };

      await expect(service.createComplaint(testPurohitUser, dto, [])).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockComplaintRepository.save).not.toHaveBeenCalled();
      expect(mockNotificationService.notifyAdmins).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Test 10 — Description fallback when subject is missing
  // =========================================================================
  describe('Test 10 — Description fallback when subject is missing', () => {
    it('uses trimmed description as summary in notification when subject is omitted', async () => {
      const dto: CreateComplaintDto = {
        description: 'Need help resetting my account phone number and email address.',
      };

      await service.createComplaint(testCustomer, dto, []);

      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        'New General Complaint',
        'New general complaint received from Rahul Sharma: Need help resetting my account phone number and email address.',
        NOTIFICATION_TYPE.SYSTEM,
        501,
        'COMPLAINT',
        expect.anything(),
      );
    });
  });
});
