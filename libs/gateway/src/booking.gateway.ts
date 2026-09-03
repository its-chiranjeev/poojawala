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
    const userId = client.handshake.auth.userId;
    if (userId) {
      client.join(`user:${userId}`);
      console.log(`User ${userId} connected and joined room user:${userId}`);
    }
  }

  handleDisconnect(client: Socket) {
    // Socket.IO automatically leaves rooms on disconnect, so we don't strictly need to do anything here
    const userId = client.handshake.auth.userId;
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

  dismissNotification(userId: string | number) {
    this.server.to(`user:${userId}`).emit('booking_taken');
  }
}
