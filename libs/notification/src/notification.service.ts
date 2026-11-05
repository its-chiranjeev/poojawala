import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationRepository, UserRepository } from '@poojawala/repositories';
import { NotificationQueryDto } from '@poojawala/dtos';
import { NOTIFICATION_TYPE, USER_ROLE, USER_STATUS } from '@poojawala/entities';
import { BookingGateway } from '@poojawala/gateway';

export interface FormattedSchedule {
  scheduledDate: string | null;
  scheduledTime: string | null;
  formattedSchedule: string | null;
}

export function formatScheduledAt(scheduledAt?: Date | string | null): FormattedSchedule {
  if (!scheduledAt) {
    return {
      scheduledDate: null,
      scheduledTime: null,
      formattedSchedule: null,
    };
  }

  const d = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (isNaN(d.getTime())) {
    return {
      scheduledDate: null,
      scheduledTime: null,
      formattedSchedule: null,
    };
  }

  const scheduledDate = d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const rawTime = d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const scheduledTime = rawTime ? rawTime.toUpperCase() : rawTime;

  return {
    scheduledDate,
    scheduledTime,
    formattedSchedule: `Date: ${scheduledDate}, Time: ${scheduledTime}`,
  };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly userRepository: UserRepository,
    private readonly bookingGateway: BookingGateway,
  ) {}

  getGateway(): BookingGateway {
    return this.bookingGateway;
  }

  private enrichWithFormattedSchedule(extraData?: Record<string, any>): Record<string, any> | undefined {
    if (!extraData || typeof extraData !== 'object') {
      return extraData;
    }

    const cloned: Record<string, any> = { ...extraData };
    const scheduledAtVal = cloned.scheduledAt || cloned.booking?.scheduledAt;

    if (scheduledAtVal) {
      const { scheduledDate, scheduledTime } = formatScheduledAt(scheduledAtVal);
      if (scheduledDate && scheduledTime) {
        if (!cloned.scheduledDate) {
          cloned.scheduledDate = scheduledDate;
        }
        if (!cloned.scheduledTime) {
          cloned.scheduledTime = scheduledTime;
        }
        if (cloned.notification && typeof cloned.notification === 'object') {
          cloned.notification = {
            ...cloned.notification,
            scheduledDate: cloned.notification.scheduledDate || scheduledDate,
            scheduledTime: cloned.notification.scheduledTime || scheduledTime,
          };
        }
      }
    }

    return cloned;
  }

  async createNotification(
    userId: number,
    title: string,
    message: string,
    type: NOTIFICATION_TYPE,
    referenceId?: number,
    referenceType?: string,
    emitSocket: boolean = true,
    extraData?: Record<string, any>,
  ) {
    const enrichedExtraData = this.enrichWithFormattedSchedule(extraData);

    const entity = this.notificationRepository.create({
      userId,
      title,
      message,
      type,
      referenceId,
      referenceType,
      isRead: false,
    });

    const savedNotification = await this.notificationRepository.save(entity);

    if (emitSocket) {
      const socketPayload = enrichedExtraData
        ? { ...savedNotification, ...enrichedExtraData }
        : savedNotification;

      // Emit real-time notification
      this.bookingGateway.emitNotification(userId, socketPayload);

      // Also broadcast unread count
      const unreadCount = await this.getUnreadCount(userId);
      this.bookingGateway.notifyUser(userId, 'notification:unread-count', unreadCount);
    }

    return savedNotification;
  }

  async getUserNotifications(userId: number, query: NotificationQueryDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      success: true,
      data: {
        items,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getUnreadCount(userId: number) {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: number, notificationId: number) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    const updated = await this.notificationRepository.save(notification);

    const unreadCount = await this.getUnreadCount(userId);
    this.bookingGateway.notifyUser(userId, 'notification:unread-count', unreadCount);

    return updated;
  }

  async markAllAsRead(userId: number) {
    await this.notificationRepository.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    const unreadCount = await this.getUnreadCount(userId);
    this.bookingGateway.notifyUser(userId, 'notification:unread-count', unreadCount);

    return { success: true };
  }

  async deleteNotification(userId: number, notificationId: number) {
    const result = await this.notificationRepository.softDelete({
      id: notificationId,
      userId,
    } as any);

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }

    // Also broadcast unread count after deletion
    const unreadCount = await this.getUnreadCount(userId);
    this.bookingGateway.notifyUser(userId, 'notification:unread-count', unreadCount);

    return { success: true };
  }

  async notifyAdmins(
    title: string,
    message: string,
    type: NOTIFICATION_TYPE,
    referenceId?: number,
    referenceType?: string,
    extraData?: any,
  ) {
    const admins = await this.userRepository.find({
      where: {
        role: USER_ROLE.ADMIN,
        status: USER_STATUS.ACTIVE,
      },
    });

    const savedNotifications: any[] = [];
    const adminUserIds: number[] = [];

    for (const admin of admins) {
      try {
        const notif = await this.createNotification(
          admin.id,
          title,
          message,
          type,
          referenceId,
          referenceType,
          false, // do not emit individual socket here to avoid duplicates
        );
        savedNotifications.push(notif);
        adminUserIds.push(admin.id);

        // Update unread count badge for this admin
        const unreadCount = await this.getUnreadCount(admin.id);
        this.bookingGateway.notifyUser(admin.id, 'notification:unread-count', unreadCount);
      } catch (err: unknown) {
        // Continue to other admins if one fails
      }
    }

    const enrichedExtraData = this.enrichWithFormattedSchedule(extraData);

    const payload = {
      id: savedNotifications[0]?.id || Date.now(),
      title,
      message,
      type,
      referenceId,
      referenceType,
      createdAt: new Date(),
      ...enrichedExtraData,
    };

    // Socket.IO automatically deduplicates across all rooms when an array is passed to .to()
    const targetRooms = Array.from(
      new Set(['admin', ...adminUserIds.map((id) => `user:${id}`)]),
    );

    this.bookingGateway.emitToRooms(targetRooms, 'notification:new', payload);

    return savedNotifications;
  }
}
