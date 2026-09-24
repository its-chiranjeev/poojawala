import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BookingGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const auth = client.handshake.auth || {};
    const query = client.handshake.query || {};
    const userId = auth.userId || query.userId;
    const role = (auth.role || query.role || '').toString().toUpperCase();

    if (userId) {
      client.join(`user:${userId}`);
      console.log(`User ${userId} connected and joined room user:${userId}`);
    }

    if (
      role === 'ADMIN' ||
      auth.isAdmin === true ||
      auth.isAdmin === 'true' ||
      query.isAdmin === 'true'
    ) {
      client.join('admin');
      console.log(`Admin ${userId || client.id} connected and joined room admin`);
    }

    client.on('join_admin_room', () => {
      client.join('admin');
      console.log(`Socket ${client.id} explicitly joined room admin`);
    });
  }

  handleDisconnect(client: Socket) {
    // Socket.IO automatically leaves rooms on disconnect, so we don't strictly need to do anything here
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;
    if (userId) {
      console.log(`User ${userId} disconnected`);
    }
  }

  notifyUser(
    userId: string | number,
    eventName: string,
    data: any,
  ): void {
    this.server.to(`user:${userId}`).emit(eventName, data);
  }

  emitNotification(userId: string | number, data: any): void {
    this.server.to(`user:${userId}`).emit('notification:new', data);
  }

  notifyAdmin(eventName: string, data: any): void {
    this.server.to('admin').emit(eventName, data);
  }

  emitAdminNotification(data: any): void {
    this.server.to('admin').emit('notification:new', data);
  }

  dismissNotification(userId: string | number) {
    this.server.to(`user:${userId}`).emit('booking_taken');
  }
}
