import { NotificationService, formatScheduledAt } from './notification.service';
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
      emitToRooms: jest.fn(),
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

    it('preserves extraData attached to socketPayload', async () => {
      await service.createNotification(
        10,
        'Booking Confirmed',
        'Your pooja has been confirmed',
        NOTIFICATION_TYPE.BOOKING,
        99,
        'BOOKING',
        true,
        { bookingId: 99, status: 'CONFIRMED' },
      );

      expect(mockBookingGateway.emitNotification).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.emitNotification).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          bookingId: 99,
          status: 'CONFIRMED',
          title: 'Booking Confirmed',
        }),
      );
    });

    it('does not emit socket event when emitSocket is false', async () => {
      await service.createNotification(
        10,
        'Silent Note',
        'Internal note',
        NOTIFICATION_TYPE.SYSTEM,
        undefined,
        undefined,
        false,
      );

      expect(mockBookingGateway.emitNotification).not.toHaveBeenCalled();
      expect(mockBookingGateway.notifyUser).not.toHaveBeenCalled();
    });

    it('delegates cross-service delivery purely to BookingGateway without duplicate bridging', async () => {
      process.env.CURRENT_SERVICE = 'payment-service';

      await service.createNotification(
        25,
        'Payment Success',
        '₹500 received',
        NOTIFICATION_TYPE.PAYMENT,
      );

      // Exactly 1 emitNotification and 1 notifyUser (unread-count), delegated cleanly to BookingGateway
      expect(mockBookingGateway.emitNotification).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.notifyUser).toHaveBeenCalledTimes(1);
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

    it('emits exactly 1 broadcast socket event for all target rooms without duplicates via emitToRooms', async () => {
      await service.notifyAdmins(
        'Purohit Verification Resubmitted',
        'Rahul Sharma resubmitted profile',
        NOTIFICATION_TYPE.SYSTEM,
        10,
        'PUROHIT_PROFILE',
        { purohitId: 10 },
      );

      // emitToRooms() called with deduplicated target rooms
      expect(mockBookingGateway.emitToRooms).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.emitToRooms).toHaveBeenCalledWith(
        ['admin', 'user:101', 'user:102'],
        'notification:new',
        expect.objectContaining({
          title: 'Purohit Verification Resubmitted',
          message: 'Rahul Sharma resubmitted profile',
          type: NOTIFICATION_TYPE.SYSTEM,
          referenceId: 10,
          purohitId: 10,
        }),
      );

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

      mockBookingGateway.emitToRooms.mockImplementation(() => {
        callOrder.push('socket_emit');
      });

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
      mockBookingGateway.emitToRooms.mockImplementation(() => {
        throw new Error('Socket.IO connection disconnected');
      });

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

  describe('formatScheduledAt and scheduled date/time separation', () => {
    it('formats ISO date string into understandable date and time separately in IST', () => {
      // 2026-11-05T10:30:00.000Z -> 04:00 PM IST (10:30 UTC + 5:30)
      const res = formatScheduledAt('2026-11-05T10:30:00.000Z');
      expect(res.scheduledDate).toBe('05 Nov 2026');
      expect(res.scheduledTime).toBe('04:00 PM');
      expect(res.formattedSchedule).toBe('Date: 05 Nov 2026, Time: 04:00 PM');
    });

    it('formats Date object into understandable date and time separately', () => {
      const d = new Date('2026-08-15T03:30:00.000Z'); // 09:00 AM IST
      const res = formatScheduledAt(d);
      expect(res.scheduledDate).toBe('15 Aug 2026');
      expect(res.scheduledTime).toBe('09:00 AM');
      expect(res.formattedSchedule).toBe('Date: 15 Aug 2026, Time: 09:00 AM');
    });

    it('gracefully handles null, undefined, and invalid date input', () => {
      expect(formatScheduledAt(null)).toEqual({
        scheduledDate: null,
        scheduledTime: null,
        formattedSchedule: null,
      });
      expect(formatScheduledAt(undefined)).toEqual({
        scheduledDate: null,
        scheduledTime: null,
        formattedSchedule: null,
      });
      expect(formatScheduledAt('invalid-date')).toEqual({
        scheduledDate: null,
        scheduledTime: null,
        formattedSchedule: null,
      });
    });

    it('createNotification enriches socketPayload with scheduledDate and scheduledTime when scheduledAt is present in extraData', async () => {
      const scheduledIso = '2026-11-05T10:30:00.000Z';
      await service.createNotification(
        10,
        'Booking Created',
        'Booking B-101 created. Date: 05 Nov 2026, Time: 04:00 PM.',
        NOTIFICATION_TYPE.BOOKING,
        101,
        'BOOKING',
        true,
        {
          bookingId: 101,
          scheduledAt: scheduledIso,
          notification: {
            bookingId: 101,
            scheduledAt: scheduledIso,
          },
        },
      );

      expect(mockBookingGateway.emitNotification).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.emitNotification).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          bookingId: 101,
          scheduledAt: scheduledIso,
          scheduledDate: '05 Nov 2026',
          scheduledTime: '04:00 PM',
          notification: expect.objectContaining({
            scheduledDate: '05 Nov 2026',
            scheduledTime: '04:00 PM',
          }),
        }),
      );
    });

    it('notifyAdmins enriches broadcast socketPayload with scheduledDate and scheduledTime separately', async () => {
      const scheduledIso = '2026-11-05T10:30:00.000Z';
      await service.notifyAdmins(
        'New Booking Request',
        'New booking B-101. Date: 05 Nov 2026, Time: 04:00 PM.',
        NOTIFICATION_TYPE.BOOKING,
        101,
        'BOOKING',
        {
          bookingId: 101,
          scheduledAt: scheduledIso,
        },
      );

      expect(mockBookingGateway.emitToRooms).toHaveBeenCalledTimes(1);
      expect(mockBookingGateway.emitToRooms).toHaveBeenCalledWith(
        expect.any(Array),
        'notification:new',
        expect.objectContaining({
          bookingId: 101,
          scheduledAt: scheduledIso,
          scheduledDate: '05 Nov 2026',
          scheduledTime: '04:00 PM',
        }),
      );
    });
  });
});
