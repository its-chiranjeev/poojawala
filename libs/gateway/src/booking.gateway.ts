import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import axios from 'axios';

@WebSocketGateway({ cors: { origin: '*' } })
export class BookingGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BookingGateway.name);

  handleConnection(client: Socket) {
    const auth = client.handshake.auth || {};
    const query = client.handshake.query || {};
    const userId = auth.userId || query.userId;
    const role = (auth.role || query.role || '').toString().toUpperCase();

    if (userId) {
      client.join(`user:${userId}`);
      console.log(`User ${userId} connected and joined room user:${userId}`);
    }

    const isAdmin =
      role === 'ADMIN' ||
      auth.isAdmin === true ||
      auth.isAdmin === 'true' ||
      query.isAdmin === 'true';

    if (isAdmin) {
      client.join('admin');
      console.log(`Admin ${userId || client.id} connected and joined room admin`);
    }

    client.on('join_admin_room', () => {
      if (isAdmin) {
        client.join('admin');
        console.log(`Socket ${client.id} explicitly joined room admin`);
      } else {
        console.warn(`Unauthorized attempt by socket ${client.id} to join admin room`);
      }
    });
  }

  handleDisconnect(client: Socket) {
    // Socket.IO automatically leaves rooms on disconnect, so we don't strictly need to do anything here
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;
    if (userId) {
      console.log(`User ${userId} disconnected`);
    }
  }

  private async bridgeSocketToUserService(
    rooms: string[],
    event: string,
    payload: any,
  ): Promise<void> {
    if (process.env.CURRENT_SERVICE === 'user-service') {
      return;
    }

    const primaryPort = process.env.USER_MANAGEMENT_PORT || 8011;
    try {
      await axios.post(
        `http://127.0.0.1:${primaryPort}/api/users/internal/emit-notification`,
        { rooms, event, payload },
        { timeout: 3000 },
      );
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'ECONNREFUSED' && Number(primaryPort) !== 5001) {
        try {
          await axios.post(
            `http://127.0.0.1:5001/api/users/internal/emit-notification`,
            { rooms, event, payload },
            { timeout: 3000 },
          );
          return;
        } catch {
          // ignore fallback error
        }
      }
      this.logger.debug(
        `Cross-service socket bridge from BookingGateway failed: ${(err as Error)?.message || err}`,
      );
    }
  }

  notifyUser(
    userId: string | number,
    eventName: string,
    data: unknown,
  ): void {
    this.server?.to(`user:${userId}`).emit(eventName, data);
    this.bridgeSocketToUserService([`user:${userId}`], eventName, data).catch(() => {});
  }

  notifyUsers(
    userIds: (string | number)[],
    eventName: string,
    data: unknown,
  ): void {
    if (!userIds || userIds.length === 0) return;
    const rooms = userIds.map((id) => `user:${id}`);
    this.server?.to(rooms).emit(eventName, data);
    this.bridgeSocketToUserService(rooms, eventName, data).catch(() => {});
  }

  emitNotification(userId: string | number, data: unknown): void {
    this.server?.to(`user:${userId}`).emit('notification:new', data);
    this.bridgeSocketToUserService([`user:${userId}`], 'notification:new', data).catch(() => {});
  }

  notifyAdmin(eventName: string, data: unknown): void {
    this.server?.to('admin').emit(eventName, data);
    this.bridgeSocketToUserService(['admin'], eventName, data).catch(() => {});
  }

  emitAdminNotification(data: unknown): void {
    this.server?.to('admin').emit('notification:new', data);
    this.bridgeSocketToUserService(['admin'], 'notification:new', data).catch(() => {});
  }

  dismissNotification(userId: string | number) {
    this.server?.to(`user:${userId}`).emit('booking_taken');
    this.bridgeSocketToUserService([`user:${userId}`], 'booking_taken', {}).catch(() => {});
  }
}
