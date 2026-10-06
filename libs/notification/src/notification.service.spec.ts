import { NotificationService } from './notification.service';
import { NOTIFICATION_TYPE, USER_ROLE, USER_STATUS } from '@poojawala/entities';

describe('NotificationService - Duplicate Delivery & Persistence Verification', () => {
  let service: NotificationService;

  let mockNotificationRepository: any;
  let mockUserRepository: any;
  let mockBookingGateway: any;

  beforeEach(() => {
    mockNotificationRepository = {
      create: jest.fn().mockImplementation((data: any) => ({
        id: Math.floor(Math.random() * 1000) + 1,
        ...data,
      })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      count: jest.fn().mockResolvedValue(3),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn(),
      updateMany: jest.fn(),
      softDelete: jest.fn(),
    };

    mockUserRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 101, role: USER_ROLE.ADMIN, status: USER_STATUS.ACTIVE },
        { id: 102, role: USER_ROLE.ADMIN, status: USER_STATUS.ACTIVE },
      ]),
    };

    mockBookingGateway = {
      server: {
        to: jest.fn().mockReturnValue({
          emit: jest.fn(),
        }),
      },
      emitNotification: jest.fn(),
      notifyUser: jest.fn(),
      notifyAdmin: jest.fn(),
      emitAdminNotification: jest.fn(),
    };

    process.env.CURRENT_SERVICE = 'user-service';

    service = new NotificationService(
      mockNotificationRepository,
      mockUserRepository,
      mockBookingGateway,
    );
  });

  describe('createNotification() - Single Canonical Socket Event', () => {
    it('delivers exactly 1 notification event and 1 unread-count event per recipient', async () => {
      const saved = await service.createNotification(
        10,
        'Test Title',
        'Test Message',
        NOTIFICATION_TYPE.SYSTEM,
      );

      expect(saved).toBeDefined();
      expect(mockNotificationRepository.save).toHaveBeenCalledTimes(1);

      // 1. Exactly 1 emitNotification call (emits 'notification:new')
      expect(mockBookingGateway.emitNotification).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.emitNotification).toHaveBeenCalledWith(10, saved);

      // 2. Exactly 1 notifyUser call for unread count badge ('notification:unread-count')
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledWith(
        10,
        'notification:unread-count',
        { unreadCount: 3 },
      );

      // 3. Confirm duplicate event names 'notification' and 'unread_notification_count' are NOT emitted
      expect(mockBookingGateway.notifyUser).not.toHaveBeenCalledWith(
        10,
        'notification',
        expect.anything(),
      );
      expect(mockBookingGateway.notifyUser).not.toHaveBeenCalledWith(
        10,
        'unread_notification_count',
        expect.anything(),
      );
    });
  });

  describe('notifyAdmins() - Database Record & Socket Delivery Deduplication', () => {
    it('creates exactly 1 database record per Admin recipient', async () => {
      const savedList = await service.notifyAdmins(
        'New Complaint',
        'New complaint received',
        NOTIFICATION_TYPE.BOOKING,
        500,
        'COMPLAINT',
        { complaintId: 500 },
      );

      // 2 active admins (101, 102) -> exactly 2 notification records saved
      expect(savedList).toHaveLength(2);
      expect(mockNotificationRepository.save).toHaveBeenCalledTimes(2);

      const savedUserIds = mockNotificationRepository.save.mock.calls.map(
        (call: any[]) => call[0].userId,
      );
      expect(savedUserIds).toEqual([101, 102]);
    });

    it('emits exactly 1 broadcast socket event for all target rooms without duplicates', async () => {
      const emitSpy = jest.fn();
      mockBookingGateway.server.to.mockReturnValue({ emit: emitSpy });

      await service.notifyAdmins(
        'Purohit Verification Resubmitted',
        'Rahul Sharma resubmitted profile',
        NOTIFICATION_TYPE.SYSTEM,
        10,
        'PUROHIT_PROFILE',
        { purohitId: 10 },
      );

      // to() called with deduplicated target rooms
      expect(mockBookingGateway.server.to).toHaveBeenCalledWith([
        'admin',
        'user:101',
        'user:102',
      ]);

      // Exactly 1 broadcast emit call: 'notification:new'
      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(
        'notification:new',
        expect.objectContaining({
          title: 'Purohit Verification Resubmitted',
          message: 'Rahul Sharma resubmitted profile',
          type: NOTIFICATION_TYPE.SYSTEM,
          referenceId: 10,
          purohitId: 10,
        }),
      );

      // Duplicate event 'notification' must NOT be emitted
      expect(emitSpy).not.toHaveBeenCalledWith('notification', expect.anything());

      // Each admin receives exactly 1 unread count update: 'notification:unread-count'
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledWith(
        101,
        'notification:unread-count',
        { unreadCount: 3 },
      );
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledWith(
        102,
        'notification:unread-count',
        { unreadCount: 3 },
      );
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledTimes(2);
    });
  });
});
