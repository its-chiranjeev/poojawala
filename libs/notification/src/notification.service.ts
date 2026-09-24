import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationRepository, UserRepository } from '@poojawala/repositories';
import { NotificationQueryDto } from '@poojawala/dtos';
import { NOTIFICATION_TYPE, USER_ROLE, USER_STATUS } from '@poojawala/entities';
import { BookingGateway } from '@poojawala/gateway';
import axios from 'axios';

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

  private async bridgeSocketToUserService(
    rooms: string[],
    event: string,
    payload: any,
  ): Promise<void> {
    if (process.env.CURRENT_SERVICE === 'user-service') {
      return;
    }

    try {
      const userPort = process.env.USER_MANAGEMENT_PORT || 8011;
      await axios.post(
        `http://127.0.0.1:${userPort}/api/users/internal/emit-notification`,
        {
          rooms,
          event,
          payload,
        },
        { timeout: 3000 },
      );
    } catch (err: any) {
      this.logger.debug(
        `Cross-service socket bridge to user-service failed: ${err?.message}`,
      );
    }
  }

  async createNotification(
    userId: number,
    title: string,
    message: string,
    type: NOTIFICATION_TYPE,
    referenceId?: number,
    referenceType?: string,
    emitSocket: boolean = true,
  ) {
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
      // Emit real-time notification
      this.bookingGateway.emitNotification(userId, savedNotification);
      
      // Also broadcast unread count
      const unreadCount = await this.getUnreadCount(userId);
      this.bookingGateway.notifyUser(userId, 'notification:unread-count', unreadCount);

      // If running outside user-service (e.g. payment-service), bridge to user-service
      await this.bridgeSocketToUserService(
        [`user:${userId}`],
        'notification:new',
        savedNotification,
      );
      await this.bridgeSocketToUserService(
        [`user:${userId}`],
        'notification:unread-count',
        unreadCount,
      );
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
      } catch (err: any) {
        // Continue to other admins if one fails
      }
    }

    const payload = {
      id: savedNotifications[0]?.id || Date.now(),
      title,
      message,
      type,
      referenceId,
      referenceType,
      createdAt: new Date(),
      ...extraData,
    };

    // Socket.IO automatically deduplicates across all rooms when an array is passed to .to()
    const targetRooms = Array.from(
      new Set(['admin', ...adminUserIds.map((id) => `user:${id}`)]),
    );

    if (this.bookingGateway.server) {
      this.bookingGateway.server.to(targetRooms).emit('notification:new', payload);
    }

    // Bridge to user-service if running outside user-service (e.g. payment-service)
    await this.bridgeSocketToUserService(targetRooms, 'notification:new', payload);

    for (const adminId of adminUserIds) {
      const count = await this.getUnreadCount(adminId);
      await this.bridgeSocketToUserService(
        [`user:${adminId}`],
        'notification:unread-count',
        count,
      );
    }

    return savedNotifications;
  }
}
