import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationRepository } from '@poojawala/repositories';
import { NotificationQueryDto } from '@poojawala/dtos';
import { NOTIFICATION_TYPE } from '@poojawala/entities';
import { BookingGateway } from '@poojawala/gateway';

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly bookingGateway: BookingGateway,
  ) {}

  async createNotification(
    userId: number,
    title: string,
    message: string,
    type: NOTIFICATION_TYPE,
    referenceId?: number,
    referenceType?: string,
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

    // Emit real-time notification
    this.bookingGateway.emitNotification(userId, savedNotification);
    
    // Also broadcast unread count
    const unreadCount = await this.getUnreadCount(userId);
    this.bookingGateway.notifyUser(userId, 'notification:unread-count', unreadCount);

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
}
