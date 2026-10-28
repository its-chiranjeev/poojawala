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

    it('3. selects only active Admin recipients', async () => {
      await service.notifyAdmins(
        'New Temple Submitted for Verification',
        'A Purohit has submitted "Shri Ram Mandir" for Admin review.',
        NOTIFICATION_TYPE.SYSTEM,
        1,
        'TEMPLE',
      );

      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: {
          role: USER_ROLE.ADMIN,
          status: USER_STATUS.ACTIVE,
        },
      });
    });

    it('4. persists notifications before emitting Socket.IO event', async () => {
      const callOrder: string[] = [];
      mockNotificationRepository.save.mockImplementation(async (entity: unknown) => {
        callOrder.push('persistence');
        return entity;
      });

      const emitSpy = jest.fn().mockImplementation(() => {
        callOrder.push('socket_emit');
      });
      mockBookingGateway.server.to.mockReturnValue({ emit: emitSpy });

      await service.notifyAdmins(
        'New Temple Submitted for Verification',
        'A Purohit has submitted "Shri Ram Mandir" for Admin review.',
        NOTIFICATION_TYPE.SYSTEM,
        1,
        'TEMPLE',
      );

      expect(callOrder).toContain('persistence');
      expect(callOrder).toContain('socket_emit');
      expect(callOrder.indexOf('persistence')).toBeLessThan(callOrder.indexOf('socket_emit'));
    });

    it('7. retains persisted notification if Socket.IO delivery throws an error', async () => {
      const emitSpy = jest.fn().mockImplementation(() => {
        throw new Error('Socket.IO connection disconnected');
      });
      mockBookingGateway.server.to.mockReturnValue({ emit: emitSpy });

      let result;
      try {
        result = await service.notifyAdmins(
          'New Temple Submitted for Verification',
          'A Purohit has submitted "Shri Ram Mandir" for Admin review.',
          NOTIFICATION_TYPE.SYSTEM,
          1,
          'TEMPLE',
        );
      } catch {
        // Socket delivery exception caught
      }

      // Persisted notifications were saved and remain intact in the database
      expect(mockNotificationRepository.save).toHaveBeenCalled();
    });

    it('9. allows Admin to reconnect and read notifications without creating duplicates', async () => {
      const mockNotifications = [
        { id: 1, userId: 101, title: 'New Temple Submitted for Verification', isRead: false },
      ];
      mockNotificationRepository.findAndCount.mockResolvedValue([mockNotifications, 1]);

      const res = await service.getUserNotifications(101, { page: 1, limit: 10 });

      expect(res.success).toBe(true);
      expect(res.data.items).toEqual(mockNotifications);
      // Read query does not save any new notifications
      expect(mockNotificationRepository.save).not.toHaveBeenCalled();
    });

    it('10. verifies notification list, unread count, and mark-as-read lifecycle behavior', async () => {
      const notif = {
        id: 1,
        userId: 101,
        isRead: false,
        readAt: null as Date | null,
      };
      mockNotificationRepository.findOne.mockResolvedValue(notif);
      mockNotificationRepository.count.mockResolvedValue(2);

      const markRes = await service.markAsRead(101, 1);

      expect(markRes.isRead).toBe(true);
      expect(markRes.readAt).toBeInstanceOf(Date);
      expect(mockNotificationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, isRead: true }),
      );
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledWith(
        101,
        'notification:unread-count',
        { unreadCount: 2 },
      );
    });
  });
});
